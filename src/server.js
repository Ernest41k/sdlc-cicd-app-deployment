const { createApp } = require('./app');

const PORT = process.env.PORT || 3000;

createApp().listen(PORT, () => {
  console.log(`SDLC demo app listening on port ${PORT}`);
});
