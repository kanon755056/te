import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')

// 每秒執行一次
setInterval(() => {
    con()
}, 1000)

const con = () => console.log('test 1s')