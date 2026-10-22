import {validateWorkflow} from '../frontend/src/workflow.js';
const MAX_IMAGE = 5 * 1024 * 1024;
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function validateImage(image) {
  if (!image) return null;
  if (!['image/png','image/jpeg','image/webp'].includes(image.mimeType) || typeof image.data !== 'string' || image.data.length > Math.ceil(MAX_IMAGE * 4 / 3) + 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) throw new ApiError(400, '圖片必須是 5 MB 以下的 PNG、JPEG 或 WebP。');
  const bytes=Buffer.from(image.data,'base64');
  const valid=image.mimeType==='image/png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : image.mimeType==='image/jpeg' ? bytes[0]===255 && bytes[1]===216 && bytes[2]===255 : bytes.subarray(0,4).toString()==='RIFF' && bytes.subarray(8,12).toString()==='WEBP';
  if(!valid || bytes.length>MAX_IMAGE) throw new ApiError(400,'無法辨識圖片格式，請重新選擇。');
  return {mimeType:image.mimeType,data:image.data};
}
export async function generate({key, model, parts, image = false, json = false, fetcher = fetch}) {
  let response;
  try {
    response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: {'Content-Type':'application/json','x-goog-api-key':key},
      body: JSON.stringify({contents:[{role:'user',parts}], generationConfig: image ? {responseModalities:['TEXT','IMAGE']} : json ? {responseMimeType:'application/json'} : {}}),
      signal: AbortSignal.timeout(90_000)
    });
  } catch (error) { if(error instanceof ApiError) throw error; throw new ApiError(504, 'Gemini 連線逾時或無法連線，請稍後重試。'); }
  if (!response.ok) {
    const messages = {400:'Gemini 無法處理此內容，請調整提示或圖片。',401:'Gemini 金鑰無效，請檢查伺服器設定。',403:'Gemini 存取被拒絕，請確認金鑰權限、地區與服務設定。',404:'找不到設定的模型，請確認模型名稱與帳號可用模型。',429:'Gemini 額度不足或請求太頻繁，請稍後重試或檢查計費設定。'};
    throw new ApiError(response.status >= 500 ? 502 : response.status, messages[response.status] || 'Gemini 服務暫時無法完成請求。');
  }
  let data;
  try { data = await response.json(); } catch {throw new ApiError(502,'Gemini 回應格式不正確。');}
  const candidate=data.candidates?.[0];
  if(data.promptFeedback?.blockReason || (candidate?.finishReason && candidate.finishReason !== 'STOP')) throw new ApiError(422,'模型未完成產生內容，可能受到內容限制或輸出長度限制，請調整指令。');
  const output=candidate?.content?.parts || [];
  const text=output.map(p=>p.text||'').join('\n').trim();
  const images=output.filter(p=>p.inlineData && ['image/png','image/jpeg','image/webp'].includes(p.inlineData.mimeType)).map(p=>validateImage(p.inlineData));
  if(!text && !images.length) throw new ApiError(422,'模型沒有傳回內容，請調整指令後重試。');
  if(image && !images.length) throw new ApiError(422,'模型沒有傳回圖片。請調整圖片指令，或確認模型支援圖片生成。');
  return {text,images};
}
export async function executeWorkflow({flow,input,image,key,textModel,imageModel,fetcher,onStep=()=>{},onStepEnd=()=>{}}) {
  validateWorkflow(flow);
  if(typeof input!=='string' || !input.trim() || input.length>5000) throw new ApiError(400,'請輸入 1 至 5000 字的內容。');
  const attachment=validateImage(image);
  let previous={text:input.trim(),images:attachment?[attachment]:[]};
  const steps=[];let lastText='';
  for(const node of flow.nodes.filter(n=>n.type==='generate')) {
    onStep(node.id);
    const start=Date.now();
    previous=await generate({key,model:node.mode==='image'?imageModel:textModel,image:node.mode==='image',fetcher,parts:[{text:`請依下列指令處理上一個步驟的內容，使用繁體中文（除非指令另有要求）。\n\n指令：\n${node.content}\n\n上一個步驟的內容：\n${previous.text || lastText || input}`},...previous.images.map(inlineData=>({inlineData}))]});
    if(node.mode!=='image')lastText=previous.text;
    steps.push({id:node.id,title:node.title,text:previous.text,images:previous.images,durationMs:Date.now()-start});
    onStepEnd(steps.at(-1));
  }
  return {...previous,text:lastText||previous.text,steps,source:'gemini'};
}
