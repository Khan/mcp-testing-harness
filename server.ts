import {Client} from '@modelcontextprotocol/sdk/client';
import {SSEClientTransport} from '@modelcontextprotocol/sdk/client/sse.js';
import Bun from 'bun';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const showForm = (url: string, formItems: string[]) =>
    new Response(
        `<html>
<body>
<h1>MCP Testing Harness</h1>
<a href="/?url=${encodeURIComponent(url)}">Reset</a>
<form method="GET" action="/">
${formItems.join('<br/>\n')}
<button type="submit">Next</button>
</form>
</body>`,
        {
            headers: {'Content-type': 'text/html'},
        },
    );

const showIframeForm = (url: string, formItems: string[], initialUrl: string) =>
    new Response(
        `<html>
<body>
<h1>MCP Testing Harness</h1>
<a href="/?url=${encodeURIComponent(url)}">Reset</a>
<form method="GET" action="/embed" target="embed">
${formItems.join('<br/>\n')}
<button type="submit">Submit</button>
</form>
<iframe name="embed" style="width: 50vw;min-width:300px;min-height:500px;height:50vh" src="${initialUrl}" />
</body>`,
        {
            headers: {'Content-type': 'text/html'},
        },
    );

const server = Bun.serve({
    port: 3112,
    // `routes` requires Bun v1.2.3+
    routes: {
        '/': async (req) => {
            const formItems: string[] = [];

            const url = new URL(req.url);
            const serverUrl = url.searchParams.get('url');
            formItems.push(`URL: <input style="width:600px" name="url" value="${serverUrl ?? ''}" placeholder="MCP URL" />`);
            if (!serverUrl) {
                return showForm('', formItems);
            }

            const transport = new SSEClientTransport(new URL(serverUrl));

            const client = new Client({
                name: 'example-client',
                version: '1.0.0',
            });

            try {
                await client.connect(transport);
            } catch (err) {
                return new Response(`Unable to connect. Retrying in 3 seconds. ${err}`, {
                    headers: {
                        'Content-type': 'text/html',
                        status: '400',
                        Refresh: '3',
                    },
                });
            }

            const {tools} = await client.listTools();

            const toolName = url.searchParams.get('tool');
            formItems.push(`Tool: <select name="tool" value="${toolName}">
    ${tools.map((tool) => `<option value="${tool.name}">${tool.name}</option>`).join('\n')}
    </select>`);
            if (!toolName) {
                return showForm(serverUrl, formItems);
            }

            const tool = tools.find((tool) => tool.name === toolName);
            if (!tool) {
                return new Response('tool not found', {status: 400});
            }

            const tpl = tool._meta?.['openai/outputTemplate'] as string | null;
            if (!tpl) {
                console.log(tool._meta);
                return new Response("tool doesn't have openai/outputTemplate defined", {status: 400});
            }

            const fields = Object.entries(tool.inputSchema.properties!).map(([key, defn]) => {
                const value = url.searchParams.get(key);
                const required = tool.inputSchema.required?.includes(key);

                switch ((defn as {type: string}).type) {
                    case 'boolean':
                        return `${key}: <input name="${key}" type="checkbox" value="${value ?? ''}" placeholder="${key}" />${
                            required ? ` - required` : ''
                        }`;
                    case 'string':
                        return `${key}: <input style="width:600px" name="${key}" value="${value ?? ''}" placeholder="${key}" />${
                            required ? ` - required` : ''
                        }`;
                    default:
                        throw new Error(`not handling input property with schema ${JSON.stringify(defn)}`);
                }
            });
            formItems.push(
                `<ul>
                ${fields.map((item) => `<li>${item}</li>`).join('\n')}
                </ul>`,
            );

            return showIframeForm(serverUrl, formItems, `/preview${url.search}`);
        },
        '/preview': async (req) => {
            const url = new URL(req.url);
            const serverUrl = url.searchParams.get('url');
            if (!serverUrl) {
                throw new Error(`No url`);
            }
            const transport = new SSEClientTransport(new URL(serverUrl));

            const client = new Client({
                name: 'example-client',
                version: '1.0.0',
            });

            try {
                await client.connect(transport);
            } catch (err) {
                return new Response(`Unable to connect. Retrying in 3 seconds. ${err}`, {
                    headers: {
                        'Content-type': 'text/html',
                        status: '400',
                        Refresh: '3',
                    },
                });
            }

            const toolName = url.searchParams.get('tool');
            if (!toolName) {
                throw new Error(`tool`);
            }

            const {tools} = await client.listTools();
            const tool = tools.find((tool) => tool.name === toolName);
            if (!tool) {
                return new Response('tool not found', {status: 400});
            }
            const tpl = tool._meta?.['openai/outputTemplate'] as string | null;
            if (!tpl) {
                return new Response("tool doesn't have openai/outputTemplate defined", {status: 400});
            }
            const resource = await client.readResource({
                uri: tpl,
            });
            if (!resource.contents[0]) {
                return new Response('Resource invalid', {status: 500});
            }
            const resourceContent = resource.contents[0];

            const widgetCSP = resourceContent._meta!['openai/widgetCSP'];
            const csp = typeof widgetCSP === 'object' && widgetCSP && 'resource_domains' in widgetCSP ? (widgetCSP.resource_domains as string[]) : [];

            return new Response(resourceContent.text as string, {
                headers: {
                    'content-type': 'text/html',
                    'Content-Security-Policy': `default-src 'unsafe-inline' data: http://localhost:3112 wss://localhost:8225 https://localhost:8226 ${csp.join(
                        ' ',
                    )}`,
                },
            });
        },
        '/embed': async (req) => {
            const url = new URL(req.url);
            const serverUrl = url.searchParams.get('url');
            if (!serverUrl) {
                throw new Error(`No url`);
            }
            const transport = new SSEClientTransport(new URL(serverUrl));

            const client = new Client({
                name: 'example-client',
                version: '1.0.0',
            });

            try {
                await client.connect(transport);
            } catch (err) {
                return new Response(`Unable to connect. Retrying in 3 seconds. ${err}`, {
                    headers: {
                        'Content-type': 'text/html',
                        status: '400',
                        Refresh: '3',
                    },
                });
            }

            const toolName = url.searchParams.get('tool');
            if (!toolName) {
                throw new Error(`tool`);
            }

            const {tools} = await client.listTools();
            const tool = tools.find((tool) => tool.name === toolName);
            if (!tool) {
                return new Response('tool not found', {status: 400});
            }
            const tpl = tool._meta?.['openai/outputTemplate'] as string | null;
            if (!tpl) {
                return new Response("tool doesn't have openai/outputTemplate defined", {status: 400});
            }
            const resource = await client.readResource({
                uri: tpl,
            });
            if (!resource.contents[0]) {
                return new Response('Resource invalid', {status: 500});
            }
            const resourceContent = resource.contents[0];
            const values: Record<string, string | boolean> = {};
            const missing: string[] = [];
            Object.entries(tool.inputSchema.properties!).forEach(([key, defn]) => {
                const value = url.searchParams.get(key);
                const required = tool.inputSchema.required?.includes(key);
                switch ((defn as {type: string}).type) {
                    case 'boolean':
                        values[key] = value === 'true';
                        break;
                    case 'string':
                        if (value) {
                            values[key] = value;
                        } else if (required) {
                            missing.push(key);
                        }
                        break;
                    default:
                        throw new Error(`not handling input property with schema ${JSON.stringify(defn)}`);
                }
            });
            if (missing.length) {
                throw new Error(`missing required values: ${missing}`);
            }

            const widgetCSP = resourceContent._meta!['openai/widgetCSP'];
            const csp = typeof widgetCSP === 'object' && widgetCSP && 'resource_domains' in widgetCSP ? (widgetCSP.resource_domains as string[]) : [];

            // Call a tool
            const result = await client.callTool({
                name: tool.name,
                arguments: values,
            });
            if (!result.structuredContent) {
                return new Response(JSON.stringify(result));
            }

            return new Response(
                (resourceContent.text as string).replace(
                    '</head>',
                    () => `<script>openai = {toolOutput: ${JSON.stringify(result.structuredContent)}}</script></head>`,
                ),
                {
                    headers: {
                        'content-type': 'text/html',
                        'Content-Security-Policy': `default-src 'unsafe-inline' data: http://localhost:3112 wss://localhost:8225 https://localhost:8226 ${csp.join(
                            ' ',
                        )}`,
                    },
                },
            );
        },
    },
    idleTimeout: 100,
});

console.log(`serving http://localhost:${server.port}`);
