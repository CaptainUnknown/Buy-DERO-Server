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

const Environment = process.env.NODE_ENV === "production" ? paypal.core.LiveEnvironment : paypal.core.SandboxEnvironment;
const paypalClient = new paypal.core.PayPalHttpClient( new Environment(clientID, clientSecret));

const getExchangeRate = async (req, res) => {
  let exchangeRate;
  let rawResponse;

  let data = JSON.stringify("{\"currency\":\"USD\",\"code\":\"DERO\",\"meta\":false}");

  let config = {
    method: 'post',
    url: 'https://api.livecoinwatch.com/coins/single',
    headers: {
      'X-Api-Key': process.env.LCW_API_KEY,
      'Content-Type': 'application/json'
    },
    data : data
  };

  axios(config)
  .then(function (response) {
    rawResponse = data;

    const content = rawResponse;
    exchangeRate = content.rate;
    console.log(JSON.stringify(response.data));
  })
  .catch(function (error) {
    res.status(503).json({ error: "Failed to get current Exchange rates." });
  });

  console.log();
  return exchangeRate;
}

const storeItems = new Map([
  [1, { price: 3.00, name: "DERO" }], //getExchangeRate() should return total price & quantity must be 1
])

app.post("/create-order", async (req, res) => {
  //const wallet = req.body.items.wallet
  const request = new paypal.orders.OrdersCreateRequest()
  const total = req.body.items.reduce((sum, item) => {
    return sum + storeItems.get(item.id).price * item.quantity
  }, 0)
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
            quantity: item.quantity, //should be 1
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
})

app.post("/capture-order", async (req, res) => {
  const request = new paypal.orders.OrdersCaptureRequest(req.body.orderID);
  request.requestBody({});

  try {
    const capture = await paypalClient.execute(request);

    console.log(`Response: ${JSON.stringify(response)}`);
    console.log(`Capture: ${JSON.stringify(response.result)}`);

    console.log(capture);
    
    //const paymentInfo = capture.result.purchase_units[0].payments.captures[0];
    //const DEROAmount = paymentInfo.amount.value;

    const client = new MongoClient(process.env.DB_URL, { useUnifiedTopology: true });
    try {
      await client.connect();
      await transactionDBHandler(client, capture, quantity, wallet);
    } catch (e) {
      res.status(500).json({ error: e.message })
    } finally {
      await client.close();
    }
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
});

const transactionDBHandler = async (client, capture, quantity, wallet) => {
  const result = await client.db('BuyDERO').collection('Purchase').insertOne(capture);
  console.log(`New TX Created: ${result.insertedId}`);
  
  if (getVaultBalance() < quantity) {
    res.status(500).json({ error: 'Our vault wallet is waiting for a refill process. Your DEROs will be manually dispatched as soon as possible, We\'re sorry for any inconvenience caused.' });
    return 1
  }

  await releaseDERO(quantity, wallet);
}

const getVaultBalance = async () => {
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
    return response.result.balance;
  })
  .catch(function (error) {
    console.log(error);
    res.status(500).json({ error: 'Oops! Something went wrong with the vault wallet. Your DEROs will be manually dispatched as soon as possible, We\'re sorry for any inconvenience caused.' });
    return 1
  });
}

const releaseDERO = async (quantity, wallet) => {
  let data = JSON.stringify({
    "jsonrpc": "2.0",
    "id": "1",
    "method": "transfer",
    "params": {
      "scid": "00000000000000000000000000000000",
      "destination": wallet,
      "amount": quantity
    }
  });

  let config = {
    method: 'post',
    url: 'http://127.0.0.1:10103/json_rpc',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${btoa(process.env.WALLET_USER_PASS)}`
    },
    data : data
  };

  await axios(config)
  .then(function (response) {
    console.log(JSON.stringify(response.data));
    res.status(201).json({ transactionID: 'Transaction dispatched: ' + response.result.txid });
  })
  .catch(function (error) {
    console.log(error);
    res.status(500).json({ error: 'DERO Transfer failed due to an internal server error. Your DEROs will be manually dispatched as soon as possible, We\'re sorry for any inconvenience caused.' });
  });
}
