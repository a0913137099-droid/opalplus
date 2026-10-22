# Bloom / OpalPlus

以 Google Opal 的視覺化工作流程為靈感的繁體中文圖文工具。0.2 版加入真正的 Gemini 執行端、Google 登入與 Google Drive 存檔程式。**尚未取得使用者的 Google 設定與金鑰；真實 Google 帳號、額度、模型可用性與雲端寫入需在設定完成後驗證。**

## 個人零預算試用版

預設不呼叫外部 AI，即使伺服器已有金鑰也不會自動啟用。可直接編輯節點、套用範本、示範執行、匯入匯出流程、下載文案與製作本機文字圖卡；不需要 Google 登入。示範不會生成真正的 AI 內容。

真正生成文字前，請自行在 Google 確認專案未啟用付費，且選用模型仍有免費額度；本程式不能查核帳務或保證模型免費。僅在確認後設定 `AI_ENABLED=true` 與伺服器金鑰。圖片呼叫預設封鎖，另需明確設定 `AI_IMAGES_ENABLED=true`。不會自動換模型或重試。

`AI_CALL_LIMIT=20` 限制每次伺服器啟動最多發送 20 次模型請求，包含規劃、各個生成步驟與失敗請求；重啟歸零，多個伺服器各自計算。這是個人試用的呼叫限制，不是月額度或費用上限。任何流程若中途達上限會停止，不會自動重試。

網站每次重新整理預設回到示範模式；連線設定顯示本次啟動呼叫次數。此版本供個人私下試用。主機或 Codespaces 可能另有費用，優先在自己的電腦執行，不需申辦主機。Google 登入與 Drive 都是選用。

## 開始使用

需要 Node.js 22.16 或以上（建議 24）。

```sh
npm ci
npm run dev -- --port 5173
```

Codespaces：保持 5173 連接埠為私人，在「連接埠」開啟網站。更新已有網站時，先在執行伺服器的終端機按 Ctrl+C，再執行：

```sh
git pull origin main
npm ci
npm run dev -- --port 5173
```

不設定任何憑證也能使用示範執行、編輯、參考圖上傳、文案／圖片複製、下載與文字圖卡。示範執行只呈現輸入與指令，絕不冒充模型回應。

## 啟用 Gemini（真正產生內容）

1. 在 [Google AI Studio](https://aistudio.google.com/apikey) 建立 API 金鑰，確認帳號地區、模型權限、額度及計費需求。圖片生成的可用性與計費依 Google 帳號與方案而定。
2. 在 **Codespaces 的專案根目錄**建立 `.env.local`，參照 `.env.example` 填寫 `GEMINI_API_KEY`，確認免費方案後才設定 `AI_ENABLED=true`。也可使用 Codespaces secrets 注入同名伺服器環境變數。
3. 若預設模型不可用，透過 `GEMINI_TEXT_MODEL`、`GEMINI_IMAGE_MODEL` 選擇帳號可用的相容模型。預設為 `gemini-2.5-flash` 與 `gemini-2.5-flash-image`。
4. 重啟伺服器。網站「連線設定」會顯示金鑰是否已設定。這只代表設定存在，不表示帳號、模型和額度已驗證；必須成功執行一次文案／圖片流程才算驗證。

金鑰僅用於伺服器對 `generativelanguage.googleapis.com` 的請求。不使用 `VITE_` 前綴，不存於瀏覽器或匯出流程，不要將實際金鑰貼入聊天、Git 或前端程式碼。`.env*` 已加入 Git 忽略規則（範例除外）。

## 啟用 Google 登入與 Drive／文件

1. 在 [Google Cloud Console](https://console.cloud.google.com/) 建立或選擇專案，啟用 **Google Drive API**。
2. 設定 Google Auth Platform 的品牌、對象與 OAuth 同意畫面。在測試模式將自己的 Google 帳號加入測試使用者。
3. 建立 OAuth 用戶端 ID，類型選擇「網頁應用程式」。將**網站實際來源**（含 `https://`，不含最後的 `/`）加入「已授權的 JavaScript 來源」。網站「連線設定」會直接顯示目前來源。Codespaces 名稱改變後，來源也必須更新。其他反向代理若改寫 Host，請額外設定 `PUBLIC_ORIGIN` 為網站完整來源；Codespaces 來源會依平台環境自動辨識。
4. 將公開 Client ID 填入 `.env.local` 的 `GOOGLE_CLIENT_ID`。此登入方式不需要 Client Secret，請勿新增到前端。
5. 重啟網站，在「連線設定」點 Google 登入。
6. 執行工具後，點「存成 Google 文件」、「存到 Drive」或圖片的「存至 Drive」，在 Google 的授權視窗允許 `drive.file` 存取。每次按儲存會建立一個新檔案；網站不會自行寫入或覆寫現有檔案。

登入的 Google ID token 由伺服器使用官方 `google-auth-library` 驗證，工作階段使用簽署的 HttpOnly、SameSite=Lax cookie（HTTPS 加上 Secure）。設定 Google Client ID 後，AI 端點會要求登入。工作階段為 8 小時，重啟伺服器會失效，需重新登入。

Drive 授權 token 只保留在頁面記憶體，不放入 localStorage。重新整理或到期後重新授權。只要求 `drive.file`，不要求讀取全部 Drive 或 Gmail。儲存檔案會從瀏覽器直接傳至 Google Drive；文件使用 HTML 上傳並轉成 Google 文件。OAuth 應用程式對外使用前，需依 Google 規定完成發布／驗證。

## 工作流程

- 編輯與拖曳節點，增加、刪除、調整生成步驟執行順序。執行以陣列順序為準，移動畫布不改變順序。
- 生成節點選擇「文案」或「圖片」，依序執行並傳遞前一步內容；圖片可以交給下一個文字節點撰寫圖說。圖文流程保留最後一個文字節點產出的文案及最後一步的圖片，每步完整結果另列在執行紀錄中。
- 社群文案、社群圖文、旅行與學習四種範本。設定 Gemini 後可用自然語言讓模型設計流程；未設定則依主題選用範本。
- PNG、JPEG、WebP 參考圖片（5 MB 以下），可用於多模態輸入。點 Gemini 執行時會將輸入、圖片與指令送至 Google，可能計費；錯誤不會自動重試。
- 可編輯、複製文案，下載 TXT 或 HTML 文件；複製／下載圖片。瀏覽器不支援圖片剪貼簿時會提示改用下載。
- 可把文字排成 1080×1080 PNG 圖卡。這是本機排版功能，**不是 AI 圖片生成**；過長文字會省略並標示，完整內容請另存文字檔。
- localStorage 自動儲存單一工作流程，支援 JSON 匯入匯出；選用範本會取代目前流程，需要保留時請先匯出。

## 驗證與正式執行

```sh
npm test
npm run test:e2e
npm run build
npm start
```

`npm start` 使用 Node 伺服器提供 `dist` 與 API（預設 5173，可用 `PORT` 修改），不依賴 Vite 開發伺服器。單獨把 `dist` 放到靜態網站服務不會有 AI／登入驗證 API；需部署完整 Node 服務及伺服器環境變數。

端對端測試使用 `/usr/bin/chromium`。其他電腦請調整 `playwright.config.js` 的路徑，或安裝 Playwright 瀏覽器後移除 `executablePath`。測試包括真實瀏覽器剪貼簿、下載、圖片處理、節點操作，以及以明確模擬回應測試 Gemini、Google 登入與 Drive 的成功及失敗路徑。沒有憑證的測試不能證明 Google 真實服務已啟用。

## 尚未涵蓋

這是逐步接近 Opal 的獨立工具，並非 Google Opal 的完整複製。尚無帳號專屬雲端工作流程資料庫、多人協作、公開工具網址、分支／迴圈、網路搜尋或其他第三方工具。登入不會自動將本機流程同步到帳號。伺服器有請求大小限制與同時兩個 AI 任務限制；正式公開部署仍需帳號允許清單、持久配額與用量管理，設定完成前請維持 Codespaces 埠為私人。

應用使用 Google Fonts（有系統字型回退）、Google Identity Services、Gemini API 與 Google Drive API；未執行 AI／儲存時，不會將輸入內容送往 Google AI／Drive。

## 個人示範部署

`npm run build:demo` 產生可部署的靜態個人示範版。此版本不要求 Node 後端、不發送 AI 或 Google 登入請求，保留流程編輯、範本、示範執行、圖片上傳與本機輸出。AI 選項停用，雲端儲存未啟用；工作流程僅存於瀏覽器，跨裝置請使用 JSON 匯出匯入。`.env.demo` 僅包含公開的示範功能旗標，不得放入金鑰。
