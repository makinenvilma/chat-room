require("dotenv").config();
const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const socketIo = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/chatroom", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log("✅ MongoDB-yhteys onnistui"))
  .catch((err) => console.error("❌ MongoDB-virhe:", err));

// ✅ MongoDB-malli huoneille
const RoomSchema = new mongoose.Schema({
  name: String,
  password: String,
  messages: [{ user: String, text: String, timestamp: Date }],
});

const Room = mongoose.model("Room", RoomSchema);

// ** Tallennetaan aktiiviset huoneet ja niiden ajastimet **
const activeRooms = {};

// ✅ API-reitti: Hae huoneet
app.get("/rooms", async (req, res) => {
  const rooms = await Room.find({}, "name password");
  res.json(rooms);
});

// ✅ API-reitti: Luo huone
app.post("/rooms", async (req, res) => {
  const { name, password } = req.body;
  if (!name) return res.status(400).json({ error: "Huoneen nimi on pakollinen" });

  const newRoom = new Room({ name, password, messages: [] });
  await newRoom.save();
  res.json(newRoom);
});

// ✅ API-reitti: Hae kaikki tallennetut viestit
app.get("/messages", async (req, res) => {
  try {
    const rooms = await Room.find({}, "name messages");
    const allMessages = rooms.map(room => ({
      room: room.name,
      messages: room.messages
    }));

    res.json(allMessages);
  } catch (error) {
    console.error("❌ Viestien hakeminen epäonnistui:", error);
    res.status(500).json({ error: "Palvelinvirhe" });
  }
});

// ✅ Socket.io: Käyttäjät ja huoneiden poistomekanismi
io.on("connection", (socket) => {
  console.log("🔗 Käyttäjä liittyi");

  // Käyttäjä liittyy huoneeseen
  socket.on("joinRoom", async ({ roomName, password, username }) => {
    const room = await Room.findOne({ name: roomName });
    if (!room) return socket.emit("error", "Huonetta ei löydy!");

    if (room.password && room.password !== password) {
      return socket.emit("error", "Väärä salasana!");
    }

    socket.join(roomName);

    // Poistetaan mahdollinen ajastin, jos joku liittyy takaisin
    if (activeRooms[roomName]?.timeout) {
      clearTimeout(activeRooms[roomName].timeout);
      delete activeRooms[roomName].timeout;
    }

    // Kasvatetaan käyttäjälaskuria
    activeRooms[roomName] = activeRooms[roomName] || { users: 0 };
    activeRooms[roomName].users++;

    socket.emit("roomJoined", room.messages);

    // ✅ Viestin lähettäminen
    socket.on("sendMessage", async ({ message }) => {
      const newMessage = { user: username, text: message, timestamp: new Date() };
      await Room.updateOne({ name: roomName }, { $push: { messages: newMessage } });

      io.to(roomName).emit("newMessage", newMessage);
    });

    // ✅ Käyttäjä poistuu huoneesta
    socket.on("leaveRoom", async () => {
      console.log(`🚪 ${username} poistui huoneesta ${roomName}`);

      if (activeRooms[roomName]) {
        activeRooms[roomName].users--;

        if (activeRooms[roomName].users === 0) {
          console.log(`🕒 Käynnistetään ajastin huoneen "${roomName}" poistamiseksi 1 minuutin kuluttua...`);

          activeRooms[roomName].timeout = setTimeout(async () => {
            const roomExists = await Room.findOne({ name: roomName });

            if (roomExists) {
              await Room.deleteOne({ name: roomName });
              console.log(`❌ Huone "${roomName}" poistettu.`);
            }

            delete activeRooms[roomName];
          }, 60000); // 1 minuutti = 60000 ms
        }
      }
    });
  });
});

// ✅ Käynnistetään palvelin
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Serveri käynnissä portissa ${PORT}`));
