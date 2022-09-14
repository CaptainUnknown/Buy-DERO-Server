const paypal = require("@paypal/checkout-server-sdk");
const { MongoClient } = require('mongodb');
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const PORT = 8000;

const app = express();
dotenv.config();

app.use(cors({ origin: '*' }));
app.use(express.static("."));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const Environment = process.env.NODE_ENV === "production" ? paypal.core.LiveEnvironment : paypal.core.SandboxEnvironment;
const paypalClient = new paypal.core.PayPalHttpClient( new Environment(process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_CLIENT_SECRET));

const getExchangeRate = async () => {
  let exchangeRate;
  var rawResponse;

  await fetch("https://api.livecoinwatch.com/coins/single", {
    body: "{\"currency\":\"USD\",\"code\":\"DERO\",\"meta\":false}",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": process.env.LCW_API_KEY
    },
    method: "POST"
  })
  .then(res => res.json())
  .then(data => {
    rawResponse = data;
    
    const content = rawResponse;
    exchangeRate = content.rate;
  })
  .catch(err => {
    res.status(503).json({ error: err.message })
  });

  console.log();
  return exchangeRate;
}

app.post("/create-order", async (req, res) => {
  const currentRate = await getExchangeRate();
  const request = new paypal.orders.OrdersCreateRequest();
  const total = currentRate * req.body.DEROAmount;
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
        items: {
          name: `DERO to ${req.body.walletAddress}`,
          unit_amount: {
            currency_code: "USD",
            value: currentRate,
          },
          quantity: req.body.DEROAmount,
        },
      },
    ],
  })

  try {
    const order = await paypalClient.execute(request);
    res.json({ id: order.result.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
})

app.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
});


//=========================== EFFECTUATORS =================================
const storePayment = async (txInfo) => {
  const uri = `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@deropay.7rmohib.mongodb.net/?retryWrites=true&w=majority`;
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    let isTXValid = await validateTX(txInfo);
    if(isTXValid){
      await saveTX(client, txInfo)
    }
    else{
      console.log('Transaction is not valid');
      return false;
    }
  }
  catch (err) {
    console.log(err);
    return false;
  }
  finally {
    await client.close();
    return true;
  }
}

//Validates the transaction & stores it in the database
const validateTX = async (txInfo) => {
  //Paypal logic

  
  if (DEROSent == undefined) {
    //Check if the transaction already exists in the database
    return false;
  }
  else if (DEROSent != transactionAmount) {
    //Check if the transaction amount is valid
    return false;
  }
  else if (DEROSent == transactionAmount && DEROAddress == transactionAddress) {
    
    return true;
  }
}

const saveTX = async (client, txInfo) => {
  const result = await client.db('DEROPay').collection('TXs').insertOne(txInfo);
  console.log(`New TX Created: ${result.insertedId}`);

  await releaseDERO(DEROAmount, WalletAddress);
}

const releaseDERO = async (DEROAmount, walletAddress) => {
  //Release DERO
}