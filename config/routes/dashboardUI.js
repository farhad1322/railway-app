const express = require("express");
const router = express.Router();

/**
 * SIMPLE DASHBOARD UI (READ-ONLY)
 * SAFE — no mutations
 */
router.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>eBay Automation Dashboard</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: #0f172a;
      color: #e5e7eb;
      padding: 30px;
    }
    h1 { color: #38bdf8; }
    .box {
      background: #020617;
      border: 1px solid #1e293b;
      padding: 20px;
      margin-bottom: 20px;
      border-radius: 8px;
    }
    .ok { color: #22c55e; }
    .warn { color: #facc15; }
    .bad { color: #ef4444; }
    code {
      background: #020617;
      padding: 5px 8px;
      border-radius: 5px;
      color: #38bdf8;
    }
  </style>
</head>
<body>

<h1>📊 eBay Automation Dashboard</h1>

<div class="box">
  <h2>System Status</h2>
  <p id="status">Loading...</p>
</div>

<div class="box">
  <h2>Queue</h2>
  <p id="queue">Loading...</p>
</div>

<div class="box">
  <h2>Adaptive Threshold</h2>
  <p id="threshold">Loading...</p>
</div>

<script>
async function loadDashboard() {
  const res = await fetch('/api/dashboard');
  const data = await res.json();

  document.getElementById('status').innerHTML =
    data.ok
      ? '<span class="ok">✅ System Online</span>'
      : '<span class="bad">❌ System Error</span>';

  document.getElementById('queue').innerHTML =
    'Pending products: <code>' + data.queue.pending + '</code>';

  document.getElementById('threshold').innerHTML =
    'Threshold: <code>' + data.adaptiveThreshold.threshold + '</code><br>' +
    'Seen: <code>' + data.adaptiveThreshold.seen + '</code><br>' +
    'Passed: <code>' + data.adaptiveThreshold.passed + '</code><br>' +
    'Pass Rate: <code>' + data.adaptiveThreshold.passRate + '</code>';
}

loadDashboard();
setInterval(loadDashboard, 5000);
</script>

</body>
</html>
`);
});

module.exports = router;
