export const config = { runtime: 'edge' };

export default async function handler(req) {
  const url = new URL(req.url);
  const target = url.searchParams.get('url');
  if (!target) return new Response('Missing url', { status: 400 });
  
  const res = await fetch(target);
  const text = await res.text();
  
  return new Response(text, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    }
  });
}
