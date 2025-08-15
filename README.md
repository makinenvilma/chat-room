# 💬 Chat Room Web App

A real-time messaging platform with customizable nicknames and the ability to create or join chat rooms.  
Built as part of a thesis project, this application demonstrates full-stack development skills and explores real-time communication technologies.

## Features

- **Customizable Nicknames** – Choose your display name before joining a chat.
- **Room Creation & Joining** – Start your own chat room or join an existing one from the room list.
- **Real-Time Messaging** – Instant communication powered by WebSockets.
- **Room Listing Page** – Browse all available chat rooms.
- **Responsive UI** – Works across desktop and mobile browsers.

## Screenshots

**Front Page & Room Listing**  
_Example view of the homepage with room list._

**Chat Room View**  
_Example view inside an active chat room._

## Tech Stack

- **Back-end:** Node.js, Express
- **Real-time Communication:** Socket.io
- **Database:** MongoDB
- **Front-end:** HTML, CSS, JavaScript

## 🚀 Installation & Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/chat-room-app.git
   cd chat-room-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**  
   Create a `.env` file in the project root:
   ```env
   PORT=3000
   MONGODB_URI=mongodb://localhost:27017/chatapp
   ```

4. **Run the application**
   ```bash
   npm start
   ```
   The app will be available at `http://localhost:3000`

## How It Works

- The **Express** server handles HTTP requests and serves the client files.
- **Socket.io** manages real-time, bi-directional communication between clients and server.
- **MongoDB** stores chat room and message data.
- The client UI updates instantly as messages and rooms are created.