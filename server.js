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

const RoomSchema = new mongoose.Schema({
  name: String,
  password: String,
});
const Room = mongoose.model("Room", RoomSchema);

const MessageSchema = new mongoose.Schema({
  roomName: String,
  user: String,
  text: String,
  timestamp: { type: Date, default: Date.now },
});
const Message = mongoose.model("Message", MessageSchema);

const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true },
});
const User = mongoose.model("User", UserSchema);

const activeRooms = {};
const activeUsers = {}; // Lisätty käyttäjäseuranta

app.get("/rooms", async (req, res) => {
  const rooms = await Room.find({}, "name password");
  res.json(rooms);
});

app.post("/rooms", async (req, res) => {
  const { name, password } = req.body;
  if (!name) return res.status(400).json({ error: "Huoneen nimi on pakollinen" });

  const existingRoom = await Room.findOne({ name });
  if (existingRoom) {
    return res.status(409).json({ error: "Tämän niminen huone on jo olemassa. Kokeile toista nimeä." });
  }

  const newRoom = new Room({ name, password });
  await newRoom.save();
  res.json(newRoom);
});

app.get("/messages", async (req, res) => {
  try {
    const messages = await Message.find({}, "roomName user text timestamp");
    res.json(messages);
  } catch (error) {
    console.error("❌ Viestien hakeminen epäonnistui:", error);
    res.status(500).json({ error: "Palvelinvirhe" });
  }
});

app.post("/users", async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "Käyttäjänimi on pakollinen" });

  const existingUser = await User.findOne({ username });
  if (existingUser) {
    return res.status(409).json({ error: "Tämä käyttäjänimi on jo käytössä." });
  }

  const newUser = new User({ username });
  await newUser.save();
  res.status(201).json({ message: "Käyttäjä luotu", user: newUser });
});

app.get("/users", async (req, res) => {
  const users = await User.find({}, "username");
  res.json(users);
});

app.put("/users", async (req, res) => {
  const { oldUsername, newUsername } = req.body;
  if (!oldUsername || !newUsername) {
    return res.status(400).json({ error: "Vanha ja uusi käyttäjänimi vaaditaan" });
  }

  await User.deleteOne({ username: oldUsername });

  const existing = await User.findOne({ username: newUsername });
  if (existing) {
    return res.status(409).json({ error: "Uusi käyttäjänimi on jo käytössä" });
  }

  const user = new User({ username: newUsername });
  await user.save();

  res.status(200).json({ message: "Käyttäjänimi päivitetty", user });
});

app.delete("/rooms/:roomName", async (req, res) => {
  const { roomName } = req.params;

  try {
    await Room.deleteOne({ name: roomName });
    await Message.deleteMany({ roomName });
    res.json({ message: "Huone ja sen viestit poistettu" });
  } catch (error) {
    console.error("❌ Poistovirhe:", error);
    res.status(500).json({ error: "Poistaminen epäonnistui" });
  }
});

io.on("connection", (socket) => {
  console.log("🔗 Käyttäjä liittyi:", socket.id);

  socket.on("username_set", (username) => {
    console.log("Uusi käyttäjänimi otettu käyttöön:", username);
    activeUsers[socket.id] = username;
  });

  socket.on("sendMessage", async ({ roomName, message, username }) => {
    if (!roomName) return socket.emit("error", "Huonetta ei määritelty!");

    const room = await Room.findOne({ name: roomName });
    if (!room) return socket.emit("error", "Huonetta ei löydy!");

    const newMessage = new Message({ roomName, user: username, text: message });
    await newMessage.save();

    console.log(`📨 Viesti lähetetty huoneeseen ${roomName}:`, newMessage);
    io.to(roomName).emit("newMessage", newMessage);
  });

  socket.on("joinRoom", async ({ roomName, password, username }) => {
    activeUsers[socket.id] = username; // Lisätty tähän!

    const room = await Room.findOne({ name: roomName });
    if (!room) return socket.emit("error", "Huonetta ei löydy!");

    if (room.password && room.password !== password) {
      return socket.emit("error", "Väärä salasana!");
    }

    const oldRooms = Array.from(socket.rooms);
    oldRooms.forEach((r) => {
      if (r !== socket.id) {
        socket.leave(r);
        console.log(`🚪 ${username} poistui huoneesta: ${r}`);
      }
    });

    socket.join(roomName);
    console.log(`✅ ${username} liittyi huoneeseen: ${roomName}`);

    activeRooms[roomName] = activeRooms[roomName] || { users: 0 };
    activeRooms[roomName].users++;

    const messages = await Message.find({ roomName });
    socket.emit("roomJoined", messages);
  });

  socket.on("leaveRoom", async ({ roomName, username }) => {
    console.log(`🚪 ${username} poistui huoneesta ${roomName}`);
    socket.leave(roomName);

    if (activeRooms[roomName]) {
      activeRooms[roomName].users--;
      console.log(`👤 Käyttäjämäärä huoneessa "${roomName}":`, activeRooms[roomName].users);

      if (activeRooms[roomName].users <= 0) {
        console.log(`❌ Huone "${roomName}" poistetaan, koska se on tyhjä.`);

        try {
          const roomExists = await Room.findOne({ name: roomName });
          if (roomExists) {
            await Room.deleteOne({ name: roomName });
            await Message.deleteMany({ roomName });
            console.log(`✅ Huone ja sen viestit poistettu.`);
          } else {
            console.log(`⚠️ Huonetta "${roomName}" ei löytynyt tietokannasta.`);
          }
        } catch (error) {
          console.error(`❌ Virhe poistettaessa huonetta "${roomName}":`, error);
        }

        delete activeRooms[roomName];
      }
    }
  });

  socket.on("disconnect", async () => {
    console.log("❌ Käyttäjä poistui", socket.id);
    const username = activeUsers[socket.id];
    if (username) {
      try {
        await User.deleteOne({ username });
        console.log(`✅ Käyttäjä '${username}' poistettu tietokannasta.`);
      } catch (error) {
        console.error(`❌ Virhe poistettaessa käyttäjää '${username}':`, error);
      }
      delete activeUsers[socket.id];
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Serveri käynnissä portissa ${PORT}`));
