const paypal = require("@paypal/checkout-server-sdk");
const { MongoClient } = require('mongodb');
const express = require('express');
const dotenv = require('dotenv');
const axios = require('axios');
const cors = require('cors');
const PORT = 8000;

const app = express();
dotenv.config();

app.use(cors({ origin: '*' }));
app.use(express.static("."));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const clientID = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
const walletServerURI = process.env.WALLET_SERVER_URI;

const Environment = process.env.NODE_ENV === "production" ? paypal.core.LiveEnvironment : paypal.core.SandboxEnvironment;
const paypalClient = new paypal.core.PayPalHttpClient( new Environment(clientID, clientSecret));

//Set it to zero to disable the service fee
const serviceFeePercentage = 2;

var exchangeRate;
function getExchangeRate () {
  let config = {
    method: 'get',
    url: 'https://api.coinranking.com/v2/coin/9jgCbgZ_J9mj-',
    headers: {
      'x-access-token': process.env.CR_API_KEY
    }
  };

  axios(config)
  .then(function (response) {
    exchangeRate = parseFloat(response.data.data.coin.price);
    exchangeRate = parseFloat((exchangeRate).toFixed(2));
    exchangeRate = exchangeRate + ( exchangeRate * (serviceFeePercentage / 100));
    exchangeRate = parseFloat((exchangeRate).toFixed(2));
    console.log(exchangeRate);
  })
  .catch(function (error) {
    console.log(error);
    res.status(500).json({ error: 'Failed to get exchange rate. Please try again later.' });
  });
  return exchangeRate;
}

app.post("/create-order", async (req, res) => {
  getExchangeRate();
  setTimeout(async function(){
    const storeItems = new Map([
      [1, { price: exchangeRate, name: "DERO" }],
    ]);
    const request = new paypal.orders.OrdersCreateRequest()
    let total = req.body.items.reduce((sum, item) => {
      return sum + storeItems.get(item.id).price * item.quantity
    }, 0)
    total = parseFloat((total).toFixed(2));
    request.prefer("return=representation")
    request.requestBody({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "USD",
            value: total,
            breakdown: {
              item_total: {
                currency_code: "USD",
                value: total,
              },
            },
          },
          items: req.body.items.map(item => {
            const storeItem = storeItems.get(item.id)
            return {
              name: storeItem.name,
              unit_amount: {
                currency_code: "USD",
                value: storeItem.price,
              },
              quantity: item.quantity,
            }
          }),
        },
      ],
    })
  
    try {
      const order = await paypalClient.execute(request)
      res.json({ id: order.result.id })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
 }, 1000);
})

app.post("/capture-order", async (req, res) => {
  const request = new paypal.orders.OrdersCaptureRequest(req.body.orderID);
  request.requestBody({});
  
  const wallet = req.body.wallet;

  try {
    let capture = await paypalClient.execute(request);    
    console.log(`Capture: ${JSON.stringify(capture)}`);

    const quantity = parseFloat((capture.result.purchase_units[0].payments.captures[0].amount.value / exchangeRate).toFixed(5));
    
    capture["DERO_Wallet"] = wallet;
    capture["DERO_Quantity"] = quantity;
    
    console.log('Quantity: ' + quantity);
    console.log('Gross Value: ' + capture.result.purchase_units[0].payments.captures[0].amount.value);
    console.log('Exchange Rate: ' + exchangeRate);
    
    const client = new MongoClient(process.env.DB_URL, { useUnifiedTopology: true });

    try {
      await client.connect();
      await transactionDBHandler(res, client, capture, quantity, wallet);
    } catch (e) {
      res.status(500).json({ error: e.message })
    } finally {
      await client.close();
    }
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.listen(process.env.PORT || PORT, () => {
  console.log(`Listening on ${PORT}`);
});

const transactionDBHandler = async (res, client, capture, quantity, wallet) => {
  const result = await client.db('BuyDERO').collection('Purchase').insertOne(capture);
  console.log(`User Checkout saved: ${result.insertedId}`);
  
  if (getVaultBalance(res) < quantity) {
    res.status(500).json({ error: 'Our vault wallet is waiting for a refill process. Your DEROs will be manually dispatched as soon as possible, We\'re sorry for any inconvenience caused.' });
  } else {
    console.log(quantity * 100000);
    await releaseDERO(res, quantity, wallet);
    console.log(`Released ${quantity} DEROs to ${wallet}`);
  }
}

const getVaultBalance = async (res) => {
  let balance;
  let data = JSON.stringify({
    "jsonrpc": "2.0",
    "id": "1",
    "method": "GetBalance"
  });

  let config = {
    method: 'post',
    url: 'http://127.0.0.1:10103/json_rpc',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${btoa(process.env.WALLET_USER_PASS)}`
    },
    data: data
  };

  axios(config)
  .then(function (response) {
    console.log(JSON.stringify(response.data));
    console.log(response.data.result.balance);
    balance = response.data.result.balance;
  })
  .catch(function (error) {
    console.log(error);
    res.status(500).json({ error: 'Oops! Something went wrong with the vault wallet. Your DEROs will be manually dispatched as soon as possible, We\'re sorry for any inconvenience caused.' });
    return 1
  });
  return balance;
}

const releaseDERO = async (res, quantity, wallet) => {
  let data = JSON.stringify({
    "jsonrpc": "2.0",
    "id": "1",
    "method": "transfer",
    "params": {
      "transfers": [{
        "destination": wallet,
        "amount": quantity * 100000
      }]
    }
  });

  let config = {
    method: 'post',
    url:  'http://127.0.0.1:10103/json_rpc',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${btoa(process.env.WALLET_USER_PASS)}`
    },
    data : data
  };

  await axios(config)
  .then(function (response) {
    console.log('Transaction dispatched: ' + response.data.result.txid);
    res.status(201).json({ transactionID: 'Transaction dispatched: ' + response.data.result.txid });
  })
  .catch(function (error) {
    console.log(error);
    res.status(500).json({ error: 'DERO Transfer failed due to an internal server error. Your DEROs will be manually dispatched as soon as possible, We\'re sorry for any inconvenience caused.' });
  });
}