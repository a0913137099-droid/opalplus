# Bloom / OpalPlus 個人工作流程

以繁體中文編輯節點，並在右側輸入內容、開始產出、查看逐步進度與下載結果。網站保留原有 `bloom-workflow` 瀏覽器儲存格式。

## 設定與執行

1. 到 https://aistudio.google.com/apikey 建立 Gemini API 金鑰，確認 Google 專案為免費方案、未啟用付費，並查看目前模型與免費額度。
2. 開啟網站「連線設定」，在密碼欄貼上金鑰，確認模型名稱與資料傳送選項後儲存。儲存不會呼叫模型，也不驗證額度。
3. 先選純文字流程，輸入內容，按右側「開始產出」。模型成功回應後才會顯示真正生成的結果。
4. 圖片生成須另外勾選並設定可用的圖片模型；不保證免費。未啟用圖片時，含圖片節點的流程會顯示錯誤，絕不自動付費、替換模型或重試。

金鑰只在設定時透過 HTTPS 傳給本站伺服器，以 AES-GCM 加密後存於 Secure、HttpOnly、SameSite=Strict Cookie，有效 8 小時；不寫入 localStorage、流程匯出或 Git。清除 Cookie 或點「清除本瀏覽器金鑰」即可解除。工作流程本身仍只存在目前瀏覽器，跨裝置需匯出匯入。

網站是私人測試用途。Google 登入與 Drive 儲存未啟用，請使用本機下載。模型請求限制為每個 Worker 執行個體最多 20 次，可用 AI_CALL_LIMIT 調整；個體重啟會重置，多個個體各自計算，這不是帳號配額、月用量或費用上限。

## 架構

`frontend/` 為原流程編輯器，建置到 public/editor；`worker/api.js` 提供同源 AI API 與串流進度；`worker/session.js` 管理加密設定。Vinext/Sites 提供 Worker 部署與私人存取。本站不驗證 Google 帳務，請勿把呼叫限制當成免費保證。

伺服器必須設定機密 AI_SESSION_SECRET 才能啟用金鑰設定介面。可另外設定 GEMINI_API_KEY、AI_ENABLED、AI_IMAGES_ENABLED、GEMINI_TEXT_MODEL、GEMINI_IMAGE_MODEL 作為伺服器預設；瀏覽器的設定優先。所有真實金鑰及密鑰只能放在 runtime secrets，不可寫入原始碼。

## 開發與檢查

使用 Node 22 以上，安裝依賴後執行 npm test、npm run build。npm run dev 啟動開發版。前端不直接呼叫 Google 模型 API，請求透過 /api/run 與 /api/plan。

測試覆蓋串流順序、缺少設定、圖片限制、同源檢查、上游失敗不重試、呼叫限制、加密 Cookie 與篡改拒絕。測試使用模擬 Google 回應；必須在自己的帳號上成功執行，才算驗證真實模型及免費額度。

## 由擁有者負擔的共用試用

PUBLIC_TRIAL=true 時，由伺服器依平台驗證的 oai-authenticated-user-email 與 SITE_OWNER_EMAIL 判定管理者。管理者先儲存個人金鑰及模型，再按「使用已儲存設定，開啟 7 天共用試用」。該設定以 AI_SESSION_SECRET 加密後存入 D1，訪客不會收到金鑰；7 天後自動停用，管理者可提前停止或更新。新請求停用不代表已開始的請求取消。

D1 的 trial_quotas 以原子條件更新限制每日模型請求；預設全站 60 次、同一網路 6 次，依台灣日期重置。失敗的上游請求也計入，模型清單查詢只限管理者。網路識別以伺服器 secret 雜湊，不存原始 IP；此限制是每個網路而非每個人，多位同事共用網路會共用額度，換網路也可能取得另一份額度。全站上限持久化，Worker 重啟不會重置。用量是模型呼叫次數而非費用，圖文流程可能呼叫兩次以上，額度耗盡可能中止尚未完成的流程。訪客和管理者可編輯的流程僅保存在各自瀏覽器。
