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

// Index - renders either authenticated or unauthenticated pages depending on if the user is logged in
app.get("/", (req, res) => {
	const showWelcome = req.query.welcome === "1";
	if (req.session.user) {
		res.render("index/authenticated", {
			username: req.session.user.username,
			user: req.session.user,
			showWelcome,
		});
	} else {
		res.render("index/unauthenticated", { showWelcome });
	}
});

// Renders login page
app.get("/login", (req, res) => {
	res.render("index/login", { errorMessage: null });
});

// Requests login data from user, compares to database, redirects if successful
app.post("/login", async (req, res) => {
	const { username, password } = req.body;
	const user = await User.findOne({ username });
	if (!user || !(await bcrypt.compare(password, user.password))) {
		return res.render("index/login", { errorMessage: "Invalid credentials" });
	}
	req.session.user = user;
	res.redirect("/");
});

// Renders signup page
app.get("/signup", (req, res) => {
	res.render("index/signup", { errorMessage: null });
});

// Requests signup data from user, compares username to database, checks for correct admin code if role will be admin, redirects if successful and depending on role
// <Typically, the secret admin code would be stored more securely, but for the purposes of this project, the Secret Admin Code to enter when registering as an admin is:
// "SECRET_ADMIN_CODE">
app.post("/signup", async (req, res) => {
	const { username, password, role, adminCode } = req.body;
	const existing = await User.findOne({ username });
	if (existing)
		return res.render("index/signup", { errorMessage: "Username taken" });

	if (role === "admin" && adminCode !== "SECRET_ADMIN_CODE") {
		return res.render("index/signup", { errorMessage: "Invalid admin code" });
	}

	const hashed = await bcrypt.hash(password, 10);

	if (role === "admin") {
		console.log(`⚠️  New admin registered: ${username}`);
	}

	const newUser = new User({
		username,
		password: hashed,
		role,
		color: "#000000",
	});
	await newUser.save();
	req.session.user = newUser;
	res.redirect(role === "admin" ? "/admin" : "/?welcome=1");
});

// Renders chat page if authenticated
app.get("/chat", isAuthenticated, (req, res) => {
	res.render("index/chat", {
		username: req.session.user.username,
		user: req.session.user,
	});
});

// Renders profile page
app.get("/profile", isAuthenticated, async (req, res) => {
	let username;
	if (!req.query.user) {
		username = req.session.user.username;
	} else {
		username = req.query.user;
	}

	const user = await User.findOne({ username: username });
	const joinDate = user.joinDate;
	res.render("index/profile", {
		username: username,
		joinDate: joinDate,
		user: req.session.user,
	});
});

// Renders admin page
app.get("/admin", isAuthenticated, isAdmin, async (req, res) => {
	const users = await User.find();
	const flash = req.session.flash;
	delete req.session.flash;
	res.render("index/admin", { users, flash, user: req.session.user });
});

// API to get users currently in chat
app.get("/api/online-users", (req, res) => {
	res.json({ count: onlineUsers.size });
});

// Ban - finds a user's id and deltes them from the database - ADMIN ONLY
app.post("/ban/:id", isAuthenticated, isAdmin, async (req, res) => {
	await User.findByIdAndDelete(req.params.id);
	req.session.flash = { type: "success", message: "User has been banned." };
	res.redirect("/admin");
});

// Ban - finds a user's username and deletes them from the database - ADMIN ONLY
app.post(
	"/ban-username/:username",
	isAuthenticated,
	isAdmin,
	async (req, res) => {
		const username = req.params.username;
		const user = await User.findOne({ username });
		if (user && user.role !== "admin") {
			await User.findByIdAndDelete(user._id);
			req.session.flash = {
				type: "success",
				message: `${username} has been banned.`,
			};
		}
		res.sendStatus(200);
	}
);

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
