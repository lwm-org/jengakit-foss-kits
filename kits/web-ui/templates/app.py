from flask import Flask

app = Flask(__name__)

HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>jengakit app</title>
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>body{font-family:sans-serif;display:flex;justify-content:center;padding:2rem;background:#f5f5f5}</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel">
function App() {
  const [count, setCount] = React.useState(0);
  return (
    <div style={{textAlign: 'center'}}>
      <h1>Hello from jengakit</h1>
      <p>Clicks: {count}</p>
      <button onClick={() => setCount(count + 1)}>Click me</button>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
</script>
</body>
</html>"""

@app.route('/')
def index():
    return HTML, 200, {'Content-Type': 'text/html'}

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
