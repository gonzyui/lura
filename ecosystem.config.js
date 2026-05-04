module.exports = {
    apps: [
        {
            name: 'lura-bot-legacy',
            cwd: '/home/gonzyui/lura',
            script: './dist/index.js',
            instances: 1,
            exec_mode: 'fork',

            autorestart: true,
            watch: false,

            exp_backoff_restart_delay: 100,
            min_uptime: '10s',
            max_restarts: 10,
            restart_delay: 4000,
            kill_timeout: 5000,

            max_memory_restart: '300M',

            env: {
                NODE_ENV: 'production'
            }
        }
    ]
};