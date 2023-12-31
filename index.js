const express = require("express");
const cors = require("cors");
const app = express();
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// jwt middleware
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }
  // bearer token
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.SECRET_TOKEN, (error, decoded) => {
    if (error) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

// mongoDb connect

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.kqqmxrw.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const usersCollection = client.db("sports-in-sun").collection("users");
    const instructorCollection = client
      .db("sports-in-sun")
      .collection("instructors");
    const classesCollection = client.db("sports-in-sun").collection("classes");
    const selectedClassCollection = client
      .db("sports-in-sun")
      .collection("selectedClass");
    const paymentCollection = client.db("sports-in-sun").collection("payments");

    // jwt token
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.SECRET_TOKEN, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // verify Admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "Admin") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden message" });
      }
      next();
    };

    // verify instructor
    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "Instructor") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden message" });
      }
      next();
    };

    // User collection create and display
    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.get("/profile/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send({ result, addClass });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // admin check
    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === "Admin" };
      res.send(result);
    });

    // instructor check
    app.get("/users/instructor/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { instructor: user?.role === "Instructor" };
      res.send(result);
    });

    // role selected
    app.patch("/users/:role/:id", async (req, res) => {
      const id = req.params.id;
      const role = req.params.role;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: role,
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.patch("/classes/:status/:id", async (req, res) => {
      const id = req.params.id;
      const status = req.params.status;
      const feedback = req.body.feedback;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: status,
          feedback: feedback,
        },
      };
      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // user deleted
    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });

    // instructor and classes data get for all users
    app.get("/instructors", async (req, res) => {
      const result = await instructorCollection.find().toArray();
      res.send(result);
    });

    app.get("/instructors/popular", async (req, res) => {
      const result = await instructorCollection
        .find()
        .sort({ student: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    app.get("/classes", async (req, res) => {
      const result = await classesCollection
        .find({ status: "approved" })
        .toArray();
      res.send(result);
    });

    app.get("/allClasses", async (req, res) => {
      const result = await classesCollection
        .find({ status: "pending" })
        .toArray();
      res.send(result);
    });

    app.get("/classes/popular", async (req, res) => {
      const result = await classesCollection
        .find()
        .sort({ enrolled: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    app.post("/classes", verifyJWT, verifyInstructor, async (req, res) => {
      const newClass = req.body;
      const result = await classesCollection.insertOne(newClass);
      res.send(result);
    });

    app.get(
      "/classes/myClass",
      verifyJWT,
      verifyInstructor,
      async (req, res) => {
        const email = req.query.email;
        if (!email) {
          res.send([]);
        }
        const decodedEmail = req.decoded.email;
        if (email !== decodedEmail) {
          return res
            .status(403)
            .send({ error: true, message: "forbidden access" });
        }

        const query = { email: email };
        const result = await classesCollection.find(query).toArray();
        res.send(result);
      }
    );

    app.put("/classes/:id", verifyJWT, verifyInstructor, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedClass = req.body;
      const newClass = {
        $set: {
          name: updatedClass.name,
          availableSeats: updatedClass.availableSeats,
          price: updatedClass.price,
        },
      };
      const result = await classesCollection.updateOne(filter, newClass);
      res.send(result);
    });

    app.patch("/classes/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $inc: {
          availableSeats: -1,
          enrolled: Number(1),
        },
      };

      const result = await classesCollection.updateMany(filter, updateDoc);
      res.send(result);
    });

    // Selected Class
    app.post("/selectedClass", async (req, res) => {
      const selectedClass = req.body;
      const query = {
        email: selectedClass.email,
        classId: selectedClass.classId,
      };
      const existingSelection = await selectedClassCollection.findOne(query);

      if (existingSelection) {
        return res.status(400).send({ message: "class already selected" });
      }

      const result = await selectedClassCollection.insertOne(selectedClass);
      res.send(result);
    });

    app.get("/selectedClass", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }

      const query = { email: email };
      const result = await selectedClassCollection.find(query).toArray();
      res.send(result);
    });

    app.delete("/selectedClass/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await selectedClassCollection.deleteOne(query);
      res.send(result);
    });

    // create payment intent
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // payment related api
    app.post("/payments", verifyJWT, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);

      const query = {
        _id: new ObjectId(payment.payId),
      };
      const deleteResult = await selectedClassCollection.deleteOne(query);
      res.send({ insertResult, deleteResult });
    });

    // payment history get

    app.get("/payments", verifyJWT, async (req, res) => {
      const email = req.query.email;

      if (!email) {
        res.send([]);
      }

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }

      const query = { email: email };
      const result = await paymentCollection
        .find(query)
        .sort({ date: -1 })
        .limit(10)
        .toArray();

      res.send(result);
    });

    // Dashboard stats get
    // admin Dashboard stats
    app.get("/adminStats", verifyJWT, verifyAdmin, async (req, res) => {
      const users = await usersCollection.estimatedDocumentCount();
      const classes = await classesCollection.estimatedDocumentCount();
      const instructor = await instructorCollection.estimatedDocumentCount();
      const enrolledClasses = await classesCollection.find().toArray();
      const enrolled = enrolledClasses.reduce(
        (sum, student) => sum + student.enrolled,
        0
      );
      const payments = await paymentCollection.estimatedDocumentCount();
      const totalPayment = await paymentCollection.find().toArray();
      const total = totalPayment.reduce(
        (sum, payment) => sum + payment.price,
        0
      );
      res.send({
        users,
        classes,
        instructor,
        enrolled,
        payments,
        totalPayment,
        total,
      });
    });

    // instructor stats
    app.get(
      "/instructorStats",
      verifyJWT,
      verifyInstructor,
      async (req, res) => {
        const classes = await classesCollection.estimatedDocumentCount();
        const enrolledClasses = await classesCollection.find().toArray();
        const enrolled = enrolledClasses.reduce(
          (sum, student) => sum + student.enrolled,
          0
        );
        const seats = enrolledClasses.reduce(
          (sum, student) => sum + student.availableSeats,
          0
        );

        res.send({
          classes,
          enrolledClasses,
          enrolled,
          seats,
        });
      }
    );

    // Student stats
    app.get("/studentStats", verifyJWT, async (req, res) => {
      const classes = await classesCollection.estimatedDocumentCount();
      const enrolledClasses = await classesCollection.find().toArray();
      const enrolled = enrolledClasses.reduce(
        (sum, student) => sum + student.enrolled,
        0
      );
      const seats = enrolledClasses.reduce(
        (sum, student) => sum + student.availableSeats,
        0
      );

      res.send({
        classes,
        enrolledClasses,
        enrolled,
        seats,
      });
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// server test

app.get("/", (req, res) => {
  res.send("Sports in sun server is running");
});

app.listen(port, () => {
  console.log(`Sports in sun server is running port:${port}`);
});
