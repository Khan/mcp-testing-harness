import {Client} from '@modelcontextprotocol/sdk/client';
import {SSEClientTransport} from '@modelcontextprotocol/sdk/client/sse.js';
import Bun from 'bun';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const server = Bun.serve({
    port: 3112,
    // `routes` requires Bun v1.2.3+
    routes: {
        // Static routes
        '/': async (req) => {
            const url = new URL(req.url);
            const query = url.searchParams.get('query') ?? 'dividing fractions';
            const serverUrl = url.searchParams.get('url');
            if (!serverUrl) {
                return new Response('No ?url param provided. Please give the url of the mcp server', {
                    status: 400,
                });
            }
            const transport = new SSEClientTransport(new URL(serverUrl));

            const client = new Client({
                name: 'example-client',
                version: '1.0.0',
            });

            try {
                await client.connect(transport);
            } catch (err) {
                return new Response('sorry', {
                    headers: {
                        Refresh: '3',
                    },
                });
            }

            // List resources
            const {resources} = await client.listResources();

            if (!resources[0]) {
                return new Response('Resource not found', {status: 500});
            }

            // // Read a resource
            const resource = await client.readResource({
                uri: resources[0].uri,
            });
            if (!resource.contents[0]) {
                return new Response('Resource invalid', {status: 500});
            }

            const widgetCSP = resource.contents[0]!._meta!['openai/widgetCSP'];
            const csp = typeof widgetCSP === 'object' && widgetCSP && 'resource_domains' in widgetCSP ? (widgetCSP.resource_domains as string[]) : [];

            const {tools} = await client.listTools();

            if (!tools[0]) {
                return new Response('Tool not found', {status: 500});
            }

            // Call a tool
            const result = await client.callTool({
                name: tools[0].name,
                arguments: {query},
            });

            return new Response(
                (resource.contents[0].text as string).replace(
                    '</head>',
                    `<script>openai = {toolOutput: ${JSON.stringify(result.structuredContent)}}</script></head>`,
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
});

console.log(`serving http://localhost:${server.port}`);
