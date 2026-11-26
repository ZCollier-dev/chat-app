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

// Form listener for message submission
form.addEventListener("submit", (e) => {
	e.preventDefault();
	socket.send(input.value);
	input.value = "";
});

// Renders message in chat
function renderMessage(sender, content, datetime) {
  // Apparently Temporals are coming to JS in 2027. It'll be interesting to see how they turn out.
  const timestamp = new Date(datetime);

  const msgMinute = `${timestamp.getMinutes()}`;
  let msgHour = timestamp.getHours();
  if (msgHour === 0) {
		msgHour += 12;
	} else if (timestamp.getHours() <= 12) {
		msgHour;
	} else {
		msgHour -= 12;
  }

  const msgDate = `${timestamp.getFullYear()}-${timestamp.getMonth() + 1}-${timestamp.getDate()}`
  const msgTime = `${msgHour}:${msgMinute.padStart(2, "0")}`;

  const div = document.createElement("p");
	div.innerHTML = `
      <p><span style="font-size: 0.5em">${msgDate} ${msgTime}</span> <strong class="chat-username" data-username="${sender}">${sender}</strong>: ${content}</p>
    `;
	chatBox.appendChild(div);
}

// View Profile functionality
function viewProfile() {
	if (selectedUsername) {
		window.location.href = `/profile?user=${encodeURIComponent(
			selectedUsername
		)}`;
	}
}

// Ban User Functionality - ADMIN ONLY
function banUser() {
	if (selectedUsername && confirm(`Ban ${selectedUsername}?`)) {
		fetch(`/ban-username/${encodeURIComponent(selectedUsername)}`, {
			method: "POST",
		}).then(() => {
			alert(`${selectedUsername} has been banned.`);
			location.reload();
		});
	}
}

// Context menu on right click
document.addEventListener("contextmenu", function (e) {
	const target = e.target;
	if (target.classList.contains("chat-username")) {
		e.preventDefault();
		selectedUsername = target.dataset.username;

		const menu = document.getElementById("context-menu");
		menu.style.top = `${e.pageY}px`;
		menu.style.left = `${e.pageX}px`;
		menu.style.display = "block";
	} else {
		document.getElementById("context-menu").style.display = "none";
	}
});

// Context menu click event
document.addEventListener("click", function () {
	document.getElementById("context-menu").style.display = "none";
});
