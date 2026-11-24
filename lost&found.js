const get = id => document.getElementById(id);
const key = "finddesk-campus-v1";
const emptyData = '{"items":[],"claims":[],"alerts":[]}';
let saved = null;
let data = JSON.parse(emptyData);

function load() {
  saved = localStorage.getItem(key);
  data = JSON.parse(saved || emptyData);
}

function commit() {
  try {
    if (localStorage.getItem(key) !== saved) {
      load();
      showPage();
      alert("Reports changed in another tab. Review the latest records and try again.");
      return false;
    }
    const next = JSON.stringify(data);
    localStorage.setItem(key, next);
    saved = next;
    return true;
  } catch {
    data = JSON.parse(saved || emptyData);
    alert("Could not save. Allow local storage or use a smaller photo.");
    return false;
  }
}

function add(parent, tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  parent.append(node);
  return node;
}

function link(parent, text, route) {
  add(parent, "a", text).href = "#" + route;
}

function card(parent, heading) {
  const box = add(parent, "article", "");
  add(box, "h3", heading);
  return box;
}

function empty(parent, text) {
  if (!parent.children.length) add(parent, "p", text).className = "empty";
}

function findItem(id) {
  return data.items.find(item => item.id === Number(id));
}

function title(item) {
  return "#" + item.id + " · " + item.name;
}

function matchReason(a, b) {
  if (a.closed || b.closed || a.kind === b.kind || a.category !== b.category) return "";
  if (a.place.toLowerCase() === b.place.toLowerCase()) return "Same category and location";
  const words = name => name.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const shared = words(a.name).find(word => word.length > 1 && words(b.name).includes(word));
  return shared ? "Same category and item word: " + shared : "";
}

function prepareForm(kind) {
  const fragment = get("reportFields").content.cloneNode(true);
  const form = fragment.querySelector("form");
  const label = form.querySelector(".locationLabel");
  label.textContent = kind === "lost" ? "Last seen at" : "Found at";
  if (kind === "lost") form.querySelector(".clue").remove();
  form.onsubmit = event => saveReport(event, kind);
  get(kind).append(fragment);
}

function saveReport(event, kind) {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = form.elements;
  const item = {
    kind, category: fields.category.value, name: fields.itemName.value.trim(),
    place: fields.place.value.trim(), description: fields.description.value.trim(),
    clue: fields.clue ? fields.clue.value.trim() : "", closed: false
  };
  if (!item.name || !item.place || !item.description || (kind === "found" && !item.clue)) {
    return alert("Enter text in every required field.");
  }
  const file = fields.photo.files[0];
  const button = form.querySelector("button");
  function post(photo) {
    button.disabled = false;
    item.id = data.items.length + 1;
    item.photo = photo;
    let count = 0;
    for (const other of data.items) {
      if (matchReason(item, other)) {
        data.alerts.push({ text: "Possible match: " + title(item) + " and " + title(other), route: "matches" });
        count++;
      }
    }
    data.items.push(item);
    if (!commit()) return;
    form.reset();
    location.hash = "report/" + item.id;
    get("notice").textContent = "Report posted. Possible matches: " + count + ".";
  }
  if (!file) return post("");
  if (!["image/jpeg", "image/png"].includes(file.type) || file.size > 350000) {
    return alert("Choose a JPG or PNG up to 350 KB.");
  }
  button.disabled = true;
  const reader = new FileReader();
  reader.onload = () => post(reader.result);
  reader.onerror = () => {
    button.disabled = false;
    alert("Could not read the image. Choose it again.");
  };
  reader.readAsDataURL(file);
}

function drawBoard() {
  const list = get("list");
  list.replaceChildren();
  for (const item of [...data.items].reverse()) {
    const box = card(list, item.name);
    add(box, "p", item.kind.toUpperCase() + " · " + item.place);
    link(box, item.closed ? "View returned item" : "View report", "report/" + item.id);
  }
  empty(list, "No reports yet. Lost something or picked it up? Post the first item above.");
}

function drawDetail(id) {
  const panel = get("detail");
  panel.replaceChildren();
  const item = findItem(id);
  if (!item) return empty(panel, "Choose an item from the report board.");
  const box = card(panel, title(item));
  add(box, "p", item.kind.toUpperCase() + " · " + item.category + " · " + item.place);
  add(box, "p", item.description);
  if (item.photo) {
    const image = add(box, "img", "");
    image.src = item.photo;
    image.alt = item.name;
  }
  if (item.closed) add(box, "strong", "Returned to owner");
  else {
    link(box, "Check possible matches", "matches");
    if (item.kind === "found") {
      add(box, "br", "");
      link(box, "Claim this item", "claim/0/" + item.id);
    }
  }
}

function drawMatches() {
  const pairs = get("pairs");
  pairs.replaceChildren();
  for (const lost of data.items.filter(item => item.kind === "lost")) {
    for (const found of data.items.filter(item => item.kind === "found")) {
      const reason = matchReason(lost, found);
      if (!reason) continue;
      const box = card(pairs, reason);
      link(box, "Lost: " + title(lost), "report/" + lost.id);
      add(box, "p", "Last seen at " + lost.place);
      link(box, "Found: " + title(found), "report/" + found.id);
      add(box, "p", "Found at " + found.place);
      link(box, "Start claim", "claim/" + lost.id + "/" + found.id);
    }
  }
  empty(pairs, "No possible matches yet. Check again after another report is posted.");
}

function drawAlerts() {
  const feed = get("feed");
  feed.replaceChildren();
  for (const note of [...data.alerts].reverse()) {
    link(add(feed, "article", ""), note.text, note.route);
  }
  empty(feed, "Match and claim updates will appear here.");
}

function drawClaim(lostId, foundId) {
  const form = get("claimForm");
  for (const kind of ["lost", "found"]) {
    const select = form.elements[kind + "Id"];
    select.replaceChildren(new Option("Choose a report", ""));
    for (const item of data.items) {
      if (item.kind === kind && !item.closed) select.add(new Option(title(item), item.id));
    }
    const id = kind === "lost" ? lostId : foundId;
    if (findItem(id) && !findItem(id).closed) select.value = id;
  }
}

function saveClaim(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const lost = Number(form.elements.lostId.value);
  const found = Number(form.elements.foundId.value);
  const proof = form.elements.proof.value.trim();
  if (!proof) return alert("Enter an identifying detail.");
  if (data.claims.some(c => c.lost === lost && c.found === found && c.status === "Pending")) {
    return alert("This claim is already waiting for review.");
  }
  data.claims.push({ lost, found, proof, status: "Pending" });
  data.alerts.push({ text: "Claim submitted: lost #" + lost + " / found #" + found, route: "report/" + found });
  if (!commit()) return;
  form.reset();
  location.hash = "alerts";
  get("notice").textContent = "Claim sent. Visit the campus desk for verification.";
}

function review(index, returned) {
  const claim = data.claims[index];
  claim.status = returned ? "Returned" : "Declined";
  if (returned) {
    findItem(claim.lost).closed = true;
    findItem(claim.found).closed = true;
    for (const other of data.claims) {
      if (other.status === "Pending" && (other.lost === claim.lost || other.found === claim.found)) {
        other.status = "Closed after handover";
        claimAlert(other);
      }
    }
  }
  claimAlert(claim);
  if (commit()) {
    showPage();
    get("notice").textContent = "Decision saved: " + claim.status + ".";
  }
}

function claimAlert(claim) {
  data.alerts.push({ text: claim.status + ": lost #" + claim.lost + " / found #" + claim.found, route: "report/" + claim.found });
}

function drawDesk() {
  const queue = get("reviews");
  queue.replaceChildren();
  data.claims.forEach((claim, index) => {
    if (claim.status !== "Pending") return;
    const found = findItem(claim.found);
    const box = card(queue, title(found) + " / Lost #" + claim.lost);
    add(box, "p", "Finder's clue: " + found.clue);
    add(box, "p", "Claimant's proof: " + claim.proof);
    add(box, "button", "Verified and handed over").onclick = () => review(index, true);
    const decline = add(box, "button", "Decline claim");
    decline.className = "secondary";
    decline.onclick = () => review(index, false);
  });
  empty(queue, "No claims awaiting review.");
}

function showPage() {
  const [route, first, second] = location.hash.slice(1).split("/");
  const sections = [...document.querySelectorAll("main > section")];
  const page = sections.find(section => section.id === route) || get("board");
  for (const section of sections) section.hidden = section !== page;
  for (const a of document.querySelectorAll("nav a")) {
    if (a.hash === "#" + page.id) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  get("count").textContent = data.alerts.length;
  document.title = page.querySelector("h1").textContent + " | FindDesk";
  if (page.id === "board") drawBoard();
  if (page.id === "report") drawDetail(first);
  if (page.id === "matches") drawMatches();
  if (page.id === "alerts") drawAlerts();
  if (page.id === "claim") drawClaim(first, second);
  if (page.id === "desk") drawDesk();
  window.scrollTo(0, 0);
}

try { load(); } catch { get("notice").textContent = "Browser storage could not be loaded."; }
prepareForm("lost");
prepareForm("found");
get("claimForm").onsubmit = saveClaim;
document.addEventListener("click", event => {
  if (event.target.closest("a")) get("notice").textContent = "";
});
window.addEventListener("hashchange", showPage);
showPage();