// ES Imports - CommonJS (require('xyz')) not required anymore
import express from "express";
import expressWs from "express-ws";
import path from "path";
import mongoose from "mongoose";
import session from "express-session";
import nocache from "nocache";
import bcrypt from "bcrypt";

import Message from "./models/Message.mjs";
import User from "./models/User.mjs"
import { isAuthenticated, isAdmin } from "./middleware/authenticate.mjs";

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// MongoDB constants
const PORT = 3000;
const MONGO_URI = "mongodb://localhost:27017/realtime_chat";

// ExpressJS initialization
const app = express();
const wsInstance = expressWs(app);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// app initialization
app.use(nocache());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(
  session(
    {
  		secret: "chat-app-secret",
  		resave: false,
  		saveUninitialized: true,
    }
  )
);

// List of users active in the chat
let onlineUsers = new Set();

// WebSocket for chat - sending and recieving messages in real time
app.ws("/ws", async (ws, req) => {
  // define session user
  const userName = req.session.user?.username || "Guest";
  const userColor = req.session.user?.color || "#000000";
  onlineUsers.add(userName);

  // retrieve the 50 most recent messages
  const recentMessages = await Message.find().sort({ timestamp: -1 }).limit(50);
  ws.send(
    JSON.stringify(
      { type: "history", messages: recentMessages.reverse() }
    )
  );

  // broadcast join notification
  broadcast(
    {
      type: "notification",
      message: `${userName} has joined the chat.`,
    }
  );

  // broadcast new message
  ws.on("message", async (msg) => {
		let parsed;
		try {
			parsed = JSON.parse(msg);
		} catch {
			parsed = { content: msg, color: userColor };
		}

		const newMessage = new Message({
			sender: userName,
			content: parsed.content,
			color: parsed.color,
		});
		await newMessage.save();
		broadcast({
			type: "message",
			sender: userName,
			content: parsed.content,
			color: parsed.color,
			timestamp: new Date(),
		});
  });

  // delete user from online users, broadcast user left notification
  ws.on("close", () => {
		onlineUsers.delete(userName);
		broadcast({
			type: "notification",
			message: `${userName} has left the chat.`,
		});
	});
})

// Sends data to each client
function broadcast(data) {
	wsInstance.getWss().clients.forEach((client) => {
		if (client.readyState === 1) {
			client.send(JSON.stringify(data));
		}
	});
}



// Destroys the user's session and cookies, logging them out.
app.post("/logout", (req, res) => {
	req.session.destroy((err) => {
		if (err) {
			console.error("Session destruction error:", err);
			return res.status(500).send("Error logging out.");
		}
		res.clearCookie("connect.sid");
		res.redirect("/");
	});
});

// MongoDB Database Connection
mongoose
	.connect(MONGO_URI)
	.then(() =>
		app.listen(PORT, () =>
			console.log(`Server running at http://localhost:${PORT}`)
		)
	)
	.catch((err) => console.error("MongoDB error:", err));
