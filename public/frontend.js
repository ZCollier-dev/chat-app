const socket = new WebSocket(`ws://${window.location.host}/ws`);
const chatBox = document.getElementById("chat-box");
const form = document.getElementById("chat-form");
const input = document.getElementById("message-input");

let selectedUsername = null;

// WebSocket Listener for message event
socket.addEventListener("message", (e) => {
	const data = JSON.parse(e.data);

	if (data.type === "history") {
		data.messages.forEach((msg) =>
			renderMessage(msg.sender, msg.content, msg.timestamp)
		);
		return;
	}

	if (data.type === "message") {
		renderMessage(data.sender, data.content, data.timestamp);
	} else if (data.type === "notification") {
		const p = document.createElement("p");
		p.textContent = `* ${data.message}`;
		p.style.fontStyle = "italic";
		chatBox.appendChild(p);
	}

	chatBox.scrollTop = chatBox.scrollHeight;
});
