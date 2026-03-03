// ── Category config ──
var CATS = {
  "Swimming":      { color: "#2563EB", bg: "#DBEAFE", text: "#1E40AF" },
  "Dance":         { color: "#7C3AED", bg: "#EDE9FE", text: "#5B21B6" },
  "Gymnastics":    { color: "#0D9488", bg: "#CCFBF1", text: "#115E59" },
  "Martial Arts":  { color: "#B45309", bg: "#FEF3C7", text: "#92400E" },
  "Arts & Crafts": { color: "#BE185D", bg: "#FCE7F3", text: "#9D174D" },
  "Skating":       { color: "#0369A1", bg: "#E0F2FE", text: "#075985" },
  "Sports":        { color: "#15803D", bg: "#DCFCE7", text: "#166534" },
  "Other":         { color: "#525252", bg: "#F5F5F5", text: "#404040" }
};

var CAT_ORDER = ["Dance", "Arts & Crafts", "Gymnastics", "Martial Arts", "Swimming", "Skating", "Sports", "Other"];

// ── State ──
// Build location list from data
var ALL_LOCATIONS = (function() {
  var set = {};
  DATA.forEach(function(a) { if (a.loc) set[a.loc] = true; });
  return Object.keys(set).sort();
})();

var state = {
  day: "Sat",
  search: "",
  enabledCats: {},
  enabledLocs: null,  // null = all locations, Set = specific ones
  locSearch: "",
  zoom: 100,
  plan: JSON.parse(localStorage.getItem("spring26_plan") || "[]"),
  selectedId: null
};
CAT_ORDER.forEach(function(c) { state.enabledCats[c] = true; });

// ── Time helpers ──
var GRID_START = 8;
var GRID_END = 19;

function parseHour(s) {
  var trimmed = s.trim();
  if (trimmed.toLowerCase() === "noon") return 12;
  if (trimmed.toLowerCase() === "midnight") return 0;
  var parts = trimmed.split(" ");
  var nums = parts[0].split(":");
  var h = parseInt(nums[0], 10);
  var m = parseInt(nums[1] || "0", 10);
  var ampm = parts[1] || "";
  var hr = h + m / 60;
  if (ampm === "PM" && h !== 12) hr += 12;
  if (ampm === "AM" && h === 12) hr -= 12;
  return hr;
}

function parseTimeRange(t) {
  if (!t || t.indexOf("-") === -1) return null;
  var parts = t.split(" - ");
  return { start: parseHour(parts[0]), end: parseHour(parts[1]) };
}

function parsePrice(p) {
  if (!p) return null;
  var m = p.match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatTime12(h) {
  var hour = Math.floor(h);
  var ampm = hour >= 12 ? "PM" : "AM";
  var display = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
  return display + " " + ampm;
}

// ── Filtering ──
function getFiltered() {
  var q = state.search.toLowerCase().trim();
  return DATA.filter(function(a) {
    if (a.day !== state.day) return false;
    if (!state.enabledCats[a.cat]) return false;
    if (state.enabledLocs && !state.enabledLocs.has(a.loc)) return false;
    var tr = parseTimeRange(a.t);
    if (!tr) return false;
    if (q) {
      var hay = (a.n + " " + a.loc + " " + a.rn).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
}

// ── Group by activity name, then sub-group by location ──
function buildRows(items) {
  // First group by activity name
  var byName = {};
  var nameOrder = [];
  items.forEach(function(a) {
    if (!byName[a.n]) {
      byName[a.n] = { name: a.n, cat: a.cat, items: [] };
      nameOrder.push(a.n);
    }
    byName[a.n].items.push(a);
  });

  // Sort by category, then name
  nameOrder.sort(function(a, b) {
    var ca = CAT_ORDER.indexOf(byName[a].cat);
    var cb = CAT_ORDER.indexOf(byName[b].cat);
    if (ca === -1) ca = 99;
    if (cb === -1) cb = 99;
    if (ca !== cb) return ca - cb;
    return a.localeCompare(b);
  });

  // For each activity, if it has > 6 sessions, split into sub-rows by location
  var rows = [];
  nameOrder.forEach(function(name) {
    var group = byName[name];
    if (group.items.length <= 6) {
      rows.push({
        label: group.name,
        cat: group.cat,
        items: group.items,
        isSubRow: false
      });
    } else {
      // Sub-group by location
      var byLoc = {};
      var locOrder = [];
      group.items.forEach(function(a) {
        var loc = a.loc || "Unknown";
        if (!byLoc[loc]) {
          byLoc[loc] = [];
          locOrder.push(loc);
        }
        byLoc[loc].push(a);
      });
      locOrder.sort();
      locOrder.forEach(function(loc) {
        rows.push({
          label: group.name,
          sublabel: loc,
          cat: group.cat,
          items: byLoc[loc],
          isSubRow: true
        });
      });
    }
  });

  return rows;
}

// ── Stack overlapping blocks within a row ──
function assignStacks(items) {
  var sorted = items.slice().sort(function(a, b) {
    var ta = parseTimeRange(a.t);
    var tb = parseTimeRange(b.t);
    return (ta ? ta.start : 0) - (tb ? tb.start : 0);
  });

  var stacks = [];
  sorted.forEach(function(item) {
    var tr = parseTimeRange(item.t);
    if (!tr) { item._stack = 0; return; }
    var placed = false;
    for (var s = 0; s < stacks.length; s++) {
      if (tr.start >= stacks[s]) {
        item._stack = s;
        stacks[s] = tr.end;
        placed = true;
        break;
      }
    }
    if (!placed) {
      item._stack = stacks.length;
      stacks.push(tr.end);
    }
  });

  return Math.max(stacks.length, 1);
}

// ── Render the guide ──
function renderGuide() {
  var labelW = 200;
  var container = document.getElementById("guide-container");
  var availableW = container.clientWidth - labelW - 2;
  var totalHours = GRID_END - GRID_START;
  var fitHourW = availableW / totalHours;
  var minHourW = 120;
  var hourW = Math.max(fitHourW, minHourW) * (state.zoom / 100);
  document.documentElement.style.setProperty("--hour-w", hourW + "px");

  var items = getFiltered();
  var rows = buildRows(items);
  var planIds = {};
  state.plan.forEach(function(p) { planIds[p.id] = true; });

  var laneWidth = totalHours * hourW;

  // Time header
  var headerHtml = '<div class="time-header">';
  headerHtml += '<div class="time-header-pad"></div>';
  headerHtml += '<div class="time-slots" style="width:' + laneWidth + 'px">';
  for (var h = GRID_START; h < GRID_END; h++) {
    headerHtml += '<div class="time-slot">' + formatTime12(h) + '</div>';
  }
  headerHtml += '</div></div>';

  // Category section headers + rows
  var rowsHtml = '';
  var lastCat = '';

  rows.forEach(function(row) {
    var cat = CATS[row.cat] || CATS["Other"];
    var stackCount = assignStacks(row.items);
    var rowH = 44;
    var totalRowH = Math.max(stackCount * rowH, rowH);

    // Category divider
    if (row.cat !== lastCat) {
      lastCat = row.cat;
      rowsHtml += '<div class="grid-row cat-divider">';
      rowsHtml += '<div class="row-label cat-label-row" style="background:' + cat.bg + '">';
      rowsHtml += '<span class="row-dot" style="background:' + cat.color + '"></span>';
      rowsHtml += '<span style="font-weight:700;font-size:0.75rem;letter-spacing:0.04em;text-transform:uppercase;color:' + cat.text + '">' + esc(row.cat) + '</span>';
      rowsHtml += '</div>';
      rowsHtml += '<div class="grid-lane cat-lane" style="width:' + laneWidth + 'px;min-height:28px;background:' + cat.bg + '"></div>';
      rowsHtml += '</div>';
    }

    // Row
    rowsHtml += '<div class="grid-row">';

    // Label
    var labelText = row.isSubRow
      ? '<span style="font-size:0.75rem;color:var(--ink-2)">' + esc(row.label) + '</span><br><span style="font-size:0.6875rem;color:var(--ink-3)">' + esc(row.sublabel) + '</span>'
      : esc(row.label);

    rowsHtml += '<div class="row-label">';
    rowsHtml += '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;line-height:1.3" title="' + esc(row.label + (row.sublabel ? ' @ ' + row.sublabel : '')) + '">' + labelText + '</span>';
    rowsHtml += '<span class="row-count">' + row.items.length + '</span>';
    rowsHtml += '</div>';

    rowsHtml += '<div class="grid-lane" style="width:' + laneWidth + 'px;min-height:' + totalRowH + 'px">';

    row.items.forEach(function(a) {
      var tr = parseTimeRange(a.t);
      if (!tr) return;

      var left = (tr.start - GRID_START) * hourW;
      var width = Math.max((tr.end - tr.start) * hourW, 40);
      var top = 3 + (a._stack || 0) * rowH;
      var height = rowH - 6;

      var isFull = a.spots === 0;
      var isSelected = a.id === state.selectedId;
      var inPlan = !!planIds[a.id];

      var cls = "block";
      if (isFull) cls += " block-full";
      if (isSelected) cls += " selected";

      var borderStyle = inPlan ? "border-color:" + cat.color + ";border-width:2px;box-shadow:inset 0 0 0 1px " + cat.color : "";
      var priceStr = a.price || "fees";

      rowsHtml += '<div class="' + cls + '" ' +
        'style="left:' + left + 'px;width:' + width + 'px;top:' + top + 'px;height:' + height + 'px;' +
        'background:' + cat.bg + ';color:' + cat.text + ';' + borderStyle + '" ' +
        'onclick="selectBlock(' + a.id + ')" ' +
        'title="' + esc(a.n) + ' @ ' + esc(a.loc) + ' ' + esc(a.t) + '">';
      rowsHtml += '<div class="block-name">' + esc(a.loc) + (inPlan ? ' &#10003;' : '') + '</div>';
      rowsHtml += '<div class="block-meta">' + esc(a.t) + ' &middot; ' + esc(priceStr) + '</div>';
      rowsHtml += '</div>';
    });

    rowsHtml += '</div></div>';
  });

  if (rows.length === 0) {
    rowsHtml = '<div class="empty-guide">No activities match your filters for ' + (state.day === "Sat" ? "Saturday" : "Sunday") + '.</div>';
  }

  document.getElementById("guide").innerHTML = headerHtml + rowsHtml;

  // Update header count
  var dayLabel = state.day === "Sat" ? "Saturday" : "Sunday";
  document.querySelector(".header-sub").innerHTML = "Toronto &middot; Ages 3&ndash;5 &middot; " + dayLabel + " &middot; " + items.length + " sessions";

  updateBadge();
}

// ── Block selection / detail panel ──
function selectBlock(id) {
  state.selectedId = id;
  var a = DATA.find(function(d) { return d.id === id; });
  if (!a) return;

  var cat = CATS[a.cat] || CATS["Other"];
  var inPlan = state.plan.some(function(p) { return p.id === id; });

  document.getElementById("detail-title").innerHTML =
    '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + cat.color + ';margin-right:6px"></span>' +
    esc(a.n);

  var body = '';
  var rows = [
    ["Location", a.loc],
    ["Dates", a.dr],
    ["Day", a.day === "Sat" ? "Saturday" : "Sunday"],
    ["Time", a.t],
    ["Price", a.price || (a.purl ? '<a href="' + esc(a.purl) + '" target="_blank" style="color:var(--accent)">View fees &#8599;</a>' : "Free")],
    ["Ages", a.ages],
    ["Spots", a.spots === 0 ? '<span style="color:var(--error)">Full</span>' : (a.spots + " open")],
    ["Reg #", "#" + a.rn]
  ];
  rows.forEach(function(r) {
    body += '<div class="detail-row"><div class="detail-label">' + r[0] + '</div><div class="detail-value">' + r[1] + '</div></div>';
  });
  document.getElementById("detail-body").innerHTML = body;

  var btnLabel = inPlan ? "&#10003; In Shortlist &mdash; click to remove" : "+ Add to Shortlist";
  var btnClass = inPlan ? "btn-shortlist added" : "btn-shortlist";
  document.getElementById("detail-footer").innerHTML =
    '<button class="' + btnClass + '" onclick="togglePlan(' + id + ')" id="detail-btn">' + btnLabel + '</button>';

  document.getElementById("detail-panel").classList.add("open");
  renderGuide();
}

function closeDetail() {
  state.selectedId = null;
  document.getElementById("detail-panel").classList.remove("open");
  renderGuide();
}

// ── Plan management ──
function togglePlan(id) {
  var idx = -1;
  state.plan.forEach(function(p, i) { if (p.id === id) idx = i; });
  if (idx >= 0) {
    state.plan.splice(idx, 1);
  } else {
    var a = DATA.find(function(d) { return d.id === id; });
    if (a) state.plan.push(a);
  }
  savePlan();
  if (state.selectedId === id) selectBlock(id);
  else renderGuide();
  renderDrawer();
}

function removeFromPlan(id) {
  state.plan = state.plan.filter(function(p) { return p.id !== id; });
  savePlan();
  renderGuide();
  renderDrawer();
}

function clearAll() {
  if (state.plan.length === 0) return;
  if (!confirm("Remove all " + state.plan.length + " activities?")) return;
  state.plan = [];
  savePlan();
  renderGuide();
  renderDrawer();
}

function savePlan() {
  localStorage.setItem("spring26_plan", JSON.stringify(state.plan));
  updateBadge();
}

function updateBadge() {
  document.getElementById("shortlist-badge").textContent = state.plan.length;
}

// ── Shortlist drawer ──
function openDrawer() {
  renderDrawer();
  document.getElementById("drawer-overlay").classList.add("open");
  document.getElementById("drawer").classList.add("open");
}

function closeDrawer() {
  document.getElementById("drawer-overlay").classList.remove("open");
  document.getElementById("drawer").classList.remove("open");
}

function hasConflict(a1, a2) {
  if (a1.day !== a2.day || !a1.t || !a2.t) return false;
  var t1 = parseTimeRange(a1.t);
  var t2 = parseTimeRange(a2.t);
  if (!t1 || !t2) return false;
  return t1.start < t2.end && t2.start < t1.end;
}

function renderDrawer() {
  var CAL_START = 8;
  var CAL_END = 18;
  var HOUR_PX = 72;
  var totalHeight = (CAL_END - CAL_START) * HOUR_PX;

  var sat = state.plan.filter(function(a) { return a.day === "Sat"; });
  var sun = state.plan.filter(function(a) { return a.day === "Sun"; });

  var conflictIds = {};
  function checkConflicts(items) {
    for (var i = 0; i < items.length; i++)
      for (var j = i + 1; j < items.length; j++)
        if (hasConflict(items[i], items[j])) {
          conflictIds[items[i].id] = true;
          conflictIds[items[j].id] = true;
        }
  }
  checkConflicts(sat);
  checkConflicts(sun);

  // Update total
  var totalCost = 0;
  var hasUnknown = false;
  state.plan.forEach(function(a) {
    var p = parsePrice(a.price);
    if (p !== null) totalCost += p;
    else hasUnknown = true;
  });
  document.getElementById("drawer-total").textContent =
    state.plan.length === 0 ? "\u2014" : state.plan.length + " activities \u00B7 $" + totalCost.toFixed(2) + (hasUnknown ? " + fees" : "");

  var body = document.getElementById("drawer-body");

  if (state.plan.length === 0) {
    body.innerHTML = '<div class="cal-empty">No activities added yet.<br>Click blocks in the TV Guide, then "+ Add to Shortlist".</div>';
    return;
  }

  // Build calendar grid
  var html = '<div class="cal-grid">';

  // Column headers
  html += '<div class="cal-col-header"></div>';
  html += '<div class="cal-col-header">Saturday (' + sat.length + ')</div>';
  html += '<div class="cal-col-header">Sunday (' + sun.length + ')</div>';

  // Time column
  html += '<div class="cal-time-col" style="height:' + totalHeight + 'px">';
  for (var h = CAL_START; h <= CAL_END; h++) {
    var y = (h - CAL_START) * HOUR_PX;
    html += '<div class="cal-time-label" style="top:' + y + 'px">' + formatTime12(h) + '</div>';
  }
  html += '</div>';

  // Render a day column
  function renderDayCol(items) {
    html += '<div class="cal-day-col" style="height:' + totalHeight + 'px">';

    // Hour lines
    for (var h = CAL_START; h <= CAL_END; h++) {
      var y = (h - CAL_START) * HOUR_PX;
      html += '<div class="cal-hour-line" style="top:' + y + 'px"></div>';
      if (h < CAL_END) {
        html += '<div class="cal-half-line" style="top:' + (y + HOUR_PX / 2) + 'px"></div>';
      }
    }

    // Events
    items.forEach(function(a) {
      var tr = parseTimeRange(a.t);
      if (!tr) return;

      var top = (Math.max(tr.start, CAL_START) - CAL_START) * HOUR_PX;
      var bottom = (Math.min(tr.end, CAL_END) - CAL_START) * HOUR_PX;
      var height = Math.max(bottom - top, 28);

      var cat = CATS[a.cat] || CATS["Other"];
      var isConflict = !!conflictIds[a.id];
      var priceStr = a.price || "fees";

      html += '<div class="cal-event' + (isConflict ? ' conflict' : '') + '" ' +
        'style="top:' + top + 'px;height:' + height + 'px;background:' + cat.bg + ';color:' + cat.text + '" ' +
        'title="' + esc(a.n) + ' @ ' + esc(a.loc) + '">';
      html += '<button class="cal-event-remove" onclick="event.stopPropagation();removeFromPlan(' + a.id + ')">&times;</button>';
      html += '<div class="cal-event-name">' + esc(a.n) + '</div>';
      html += '<div class="cal-event-meta">' + esc(a.loc) + '</div>';
      if (height > 42) {
        html += '<div class="cal-event-meta">' + esc(a.t) + ' &middot; ' + esc(priceStr) + '</div>';
      }
      if (height > 56) {
        html += '<div class="cal-event-meta">#' + esc(a.rn) + '</div>';
      }
      html += '</div>';
    });

    html += '</div>';
  }

  renderDayCol(sat);
  renderDayCol(sun);

  html += '</div>';
  body.innerHTML = html;
}

// ── Category pills ──
function renderCatPills() {
  var container = document.getElementById("cat-pills");
  var html = '<span class="pill-label">Show</span>';
  CAT_ORDER.forEach(function(name) {
    var cat = CATS[name];
    var on = state.enabledCats[name];
    var style = on
      ? 'background:' + cat.bg + ';color:' + cat.text + ';border-color:' + cat.color
      : '';
    html += '<button class="pill' + (on ? ' on' : '') + '" data-cat="' + name + '" style="' + style + '">' + name + '</button>';
  });
  container.innerHTML = html;
}

document.getElementById("cat-pills").addEventListener("click", function(e) {
  var btn = e.target.closest(".pill");
  if (!btn || !btn.dataset.cat) return;
  var cat = btn.dataset.cat;
  state.enabledCats[cat] = !state.enabledCats[cat];
  renderCatPills();
  renderGuide();
});

// ── Day tabs ──
document.getElementById("day-tabs").addEventListener("click", function(e) {
  var tab = e.target.closest(".day-tab");
  if (!tab) return;
  var tabs = document.querySelectorAll(".day-tab");
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove("active");
  tab.classList.add("active");
  state.day = tab.getAttribute("data-day");
  closeDetail();
  renderGuide();
});

// ── Search ──
var searchTimer;
document.getElementById("search").addEventListener("input", function(e) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(function() {
    state.search = e.target.value;
    renderGuide();
  }, 200);
});

// ── Zoom ──
function zoomIn() {
  state.zoom = Math.min(state.zoom + 25, 250);
  document.getElementById("zoom-label").textContent = state.zoom + "%";
  renderGuide();
}

function zoomOut() {
  state.zoom = Math.max(state.zoom - 25, 50);
  document.getElementById("zoom-label").textContent = state.zoom + "%";
  renderGuide();
}

// ── Location dropdown ──
function toggleLocPanel() {
  var panel = document.getElementById("loc-panel");
  var isOpen = panel.classList.contains("open");
  if (isOpen) {
    panel.classList.remove("open");
  } else {
    panel.classList.add("open");
    renderLocList();
    document.getElementById("loc-search").value = "";
    state.locSearch = "";
    setTimeout(function() { document.getElementById("loc-search").focus(); }, 50);
  }
}

function renderLocList() {
  var q = state.locSearch.toLowerCase();
  var container = document.getElementById("loc-list");

  // Count activities per location for current day + category filters
  var locCounts = {};
  DATA.forEach(function(a) {
    if (a.day !== state.day) return;
    if (!state.enabledCats[a.cat]) return;
    if (!a.loc) return;
    locCounts[a.loc] = (locCounts[a.loc] || 0) + 1;
  });

  var html = "";
  ALL_LOCATIONS.forEach(function(loc) {
    if (q && loc.toLowerCase().indexOf(q) === -1) return;
    var count = locCounts[loc] || 0;
    var checked = !state.enabledLocs || state.enabledLocs.has(loc);
    html += '<label class="loc-item">' +
      '<input type="checkbox"' + (checked ? " checked" : "") + ' onchange="toggleLoc(\'' + loc.replace(/'/g, "\\'") + '\')">' +
      '<span class="loc-item-name">' + esc(loc) + '</span>' +
      '<span class="loc-item-count">' + count + '</span>' +
    '</label>';
  });

  if (!html) {
    html = '<div style="padding:16px;text-align:center;color:var(--ink-3);font-size:0.8125rem">No locations match</div>';
  }
  container.innerHTML = html;
}

function toggleLoc(loc) {
  if (!state.enabledLocs) {
    // Currently "all" — switching to "all except this one"
    state.enabledLocs = new Set(ALL_LOCATIONS);
    state.enabledLocs.delete(loc);
  } else if (state.enabledLocs.has(loc)) {
    state.enabledLocs.delete(loc);
    if (state.enabledLocs.size === 0) {
      state.enabledLocs = new Set();
    }
  } else {
    state.enabledLocs.add(loc);
    if (state.enabledLocs.size === ALL_LOCATIONS.length) {
      state.enabledLocs = null;
    }
  }
  updateLocTrigger();
  renderGuide();
}

function locSelectAll() {
  state.enabledLocs = null;
  updateLocTrigger();
  renderLocList();
  renderGuide();
}

function locSelectNone() {
  state.enabledLocs = new Set();
  updateLocTrigger();
  renderLocList();
  renderGuide();
}

function updateLocTrigger() {
  var trigger = document.getElementById("loc-trigger");
  var label = document.getElementById("loc-trigger-label");
  if (!state.enabledLocs) {
    label.textContent = "All locations";
    trigger.classList.remove("has-filter");
  } else {
    var n = state.enabledLocs.size;
    label.innerHTML = n + " location" + (n !== 1 ? "s" : "") + ' <span class="loc-count-badge">' + n + '</span>';
    trigger.classList.add("has-filter");
  }
}

// Location search filtering
document.getElementById("loc-search").addEventListener("input", function(e) {
  state.locSearch = e.target.value;
  renderLocList();
});

// Close dropdown when clicking outside
document.addEventListener("click", function(e) {
  var dropdown = document.getElementById("loc-dropdown");
  if (!dropdown.contains(e.target)) {
    document.getElementById("loc-panel").classList.remove("open");
  }
});

// ── Init ──
renderCatPills();
renderGuide();
renderDrawer();
