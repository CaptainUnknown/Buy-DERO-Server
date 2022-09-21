
 ![Powered by DERO](https://i.imgur.com/1vp0tBG.png)

# Buy-DERO-Server 🌐 ![Buy DERO Server](https://img.shields.io/badge/1.0.0-brightgreen)
 Server for Buy DERO Plugin.
 
 Server needs active vault wallet that is set to run as remote RPC server.

 ## Deployment 🔧

 1. `cd` into project directory.
 2. Run `npm install` to install dependencies.
 3. Use `npm run start` to start the server or use PM2 `pm2 start index.js` to start the server.
 
 
 ## Environment Variables 🌿

 **NODE_ENV**:
 "production" or can be left empty, if it's not set to production the Paypal gateway will open in sandbox mode on frontend.
 
 **PAYPAL_CLIENT_ID**:
 Paypal ClientID can be found in developers dashboard, (To obtain the ClientID, visit: [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/)).
 
 **PAYPAL_CLIENT_SECRET**:
 Paypal Client Secret can be found in developers dashboard, (To obtain the Client Secret, visit: [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/)).
 
 **CR_API_KEY**:
 CoinRank API Key can be found in developers dashboard, (To obtain the API Key, visit: [CoinRank Developer Dashboard](https://pro.coinmarketcap.com/account)).
 
 **WALLET_USER_PASS**:
 Vault wallet `-rpc-login=` credentials. (Expected format: `<user>:<password>`).
 
 **DB_URL**:
 MongoDB Connection URL.
