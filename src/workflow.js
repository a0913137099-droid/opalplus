export const templates = {
  content: { name: '社群內容靈感助手', description: '把一個小小的想法，變成值得分享的內容。', input: '今天想分享什麼？', placeholder: '例如：一間藏在台南巷弄裡的獨立書店，週末有手沖咖啡和讀書會。', prompt: '你是一位社群內容企劃。根據使用者提供的主題，寫出一則溫暖、有畫面感的社群貼文，並提供三個標籤。', output: '你的下一則好內容' },
  travel: { name: '週末旅行規劃師', description: '留一點時間，給下一場說走就走的小旅行。', input: '想去哪裡走走？', placeholder: '例如：台南兩天一夜，喜歡老屋、咖啡和在地小吃。', prompt: '根據目的地與喜好，規劃輕鬆的兩天一夜行程，包含景點、餐飲與旅行提醒。', output: '你的週末小旅行' },
  learning: { name: '學習計畫小幫手', description: '把遙遠的目標，拆成每天一點點的進步。', input: '你想學會什麼？', placeholder: '例如：我想在四週內學會用 Python 分析資料，每天有三十分鐘。', prompt: '你是耐心的學習教練。依照使用者的目標，提供四週循序漸進的學習計畫與第一個練習。', output: '從今天開始的學習路線' }
};
export function createWorkflow(key = 'content') {
 const t = templates[key] || templates.content;
 return { version: 1, name: t.name, description: t.description, template: key in templates ? key : 'content', nodes: [
 {id:'input',type:'input',title:'收集你的靈感',content:t.input,x:50,y:90},
 {id:'generate',type:'generate',title:'讓靈感發芽',content:t.prompt,x:350,y:130},
 {id:'output',type:'output',title:'準備好，分享出去',content:t.output,x:650,y:90}
 ]};
}
export function validateWorkflow(value) {
 if (!value || value.version !== 1 || typeof value.name !== 'string' || value.name.length > 100 || !Array.isArray(value.nodes) || value.nodes.length < 2 || value.nodes.length > 12) throw new Error('請匯入有效的 Bloom 工作流程檔案。');
 const ids=new Set();
 for(const n of value.nodes) {
 if(!n || typeof n.id!=='string' || ids.has(n.id) || !['input','generate','output'].includes(n.type) || typeof n.title!=='string' || typeof n.content!=='string' || n.title.length>100 || n.content.length>5000 || !Number.isFinite(n.x) || !Number.isFinite(n.y) || n.x<0 || n.y<0 || n.x>1400 || n.y>900) throw new Error('工作流程節點格式不正確。');
 ids.add(n.id);
 }
 if(value.nodes[0].type!=='input' || value.nodes.at(-1).type!=='output') throw new Error('工作流程必須以輸入開始、輸出結束。');
 return value;
}
export function demoResult(flow, input) {
 const value=input.trim();
 if (!value) throw new Error('先輸入一點靈感，再開始執行。');
 const instructions=flow.nodes.filter(n=>n.type==='generate').map(n=>n.content).join('\n');
 return `【示範結果・非 AI 生成】\n\n${flow.nodes.at(-1).content}\n\n你的靈感\n${value}\n\n已套用的流程指令\n${instructions || '直接將輸入傳送至輸出。'}\n\n這個原型已完成輸入、節點設定與輸出串接。連接 AI 服務後，這裡就會顯示模型依照上述指令產生的實際內容。`;
}
