
module.exports = {
  apps: [
    {
      name: "tg-stories-bot",
      script: "dist/index.js",
      cwd: "/opt/tg-bot",
      env: {
        NODE_ENV: "production"
      },
      autorestart: true,
      max_restarts: 5
    }
  ]
};
