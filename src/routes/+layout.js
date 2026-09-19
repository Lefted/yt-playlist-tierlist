// Every page is rendered in the browser. The node server sends the same empty shell
// for every route and the client router takes it from there — the state runes reach
// for `localStorage`, which does not exist on the server.
export const ssr = false;
export const prerender = false;
