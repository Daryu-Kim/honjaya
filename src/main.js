import { createApp } from "vue";
import App from "./App.vue";
import "./assets/arc-theme.css";
import "./registerServiceWorker";
import router from "./router";

createApp(App).use(router).mount("#app");
