const { port } = require('./config');
const { init } = require('./db');
const app = require('./app');

init().then(() => app.listen(port, () => console.log(`http://localhost:${port}`)));
