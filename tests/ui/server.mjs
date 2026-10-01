/** Local-only host for the built gadget and its real Vue/Codex dependencies. */
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const files = new Map([
    ["/tests/ui/index.html", ["tests/ui/index.html", "text/html"]],
    ["/tests/ui/mediawiki.js", ["tests/ui/mediawiki.js", "text/javascript"]],
    [
        "/dist/wpvg_assessor.min.js",
        ["dist/wpvg_assessor.min.js", "text/javascript"],
    ],
    [
        "/fixtures/vue.js",
        ["node_modules/vue/dist/vue.global.prod.js", "text/javascript"],
    ],
    [
        "/fixtures/codex.js",
        ["node_modules/@wikimedia/codex/dist/codex.umd.cjs", "text/javascript"],
    ],
    [
        "/fixtures/codex.css",
        ["node_modules/@wikimedia/codex/dist/codex.style.css", "text/css"],
    ],
]);

const server = createServer(async (request, response) => {
    const route = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const file = files.get(route);
    if (file == null) {
        response.writeHead(404);
        response.end("Fixture route not found");
        return;
    }
    try {
        const content = await readFile(new URL(file[0], root));
        response.writeHead(200, {
            "Content-Type": `${file[1]}; charset=utf-8`,
            "Cache-Control": "no-store",
        });
        response.end(content);
    } catch (error) {
        response.writeHead(500);
        response.end(String(error));
    }
});

server.listen(4173, "127.0.0.1", () => {
    console.log(`Offline gadget fixture: ${fileURLToPath(root)}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => server.close());
}
