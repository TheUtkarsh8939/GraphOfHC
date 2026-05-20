<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import NodeOverlay from '$lib/NodeOverlay.svelte';
        let colorlist = [
        '#f94144', '#fa2bbc', '#c0db11', '#f9844a', '#f9c74f',
        '#90be6d', '#43aa8b', '#4d908e', '#577590', '#277da1',
        "#af0020", "#f2efe0", "#7fefbd","#cba135", "#f78fb3", "#e056fd", "#686de0", "#ff6b81", "#ff9ff3", "#f368e0",  "#FF5733", "#33FF57", "#3357FF", "#F033FF", "#33FFF0", 
  "#FF3333", "#33FF85", "#5733FF", "#FFC300", "#C70039", 
  "#900C3F", "#581845", "#2C3E50", "#85929E", "#1ABC9C", 
  "#16A085", "#2ECC71", "#27AE60", "#3498DB", "#2980B9", 
  "#9B59B6", "#8E44AD", "#34495E", "#2C3E50", "#F1C40F", 
  "#F39C12", "#E67E22", "#D35400", "#E74C3C", "#C0392B", 
  "#ECF0F1", "#BDC3C7", "#95A5A6", "#7F8C8D", "#FFFFFF", 
  "#00ff23", "#D4AC0D", "#7D6608", "#117864", "#0E6251", 
  "#1A5276", "#154360", "#512E5F", "#4A235A", "#7B241C", 
  "#78281F", "#6E2C00", "#626567", "#4D5656", "#273746"
    ];
    interface RenderNode {
        id: string;
        ysws: string;
        code_url: string;
        description: string;
        demo_url: string;
        hours: number;
        name: string;
        x: number;
        y: number;
        radius: number;
    }

    interface RenderEdge {
        source: string;
        target: string;
        weight: number;
        startxy: number[];
        endxy: number[];
    }

    interface RenderData {
        nodes: RenderNode[];
        edges: RenderEdge[];
    }

    type Node = RenderNode;

    let canvas: HTMLCanvasElement | null = null;
    let ctx: CanvasRenderingContext2D | null = null;

    let width = 0;
    let height = 0;

    let scale = 10;
    let minScale = 0.5;
    const maxScale = 6;

    let offsetX = 0; // world translation
    let offsetY = 0;

    let isPanning = false;
    let lastPanX = 0;
    let lastPanY = 0;

    import { writable, get } from 'svelte/store';
    const hoveredNode = writable<Node | null>(null);
    const hoverScreenX = writable(0);
    const hoverScreenY = writable(0);

    const LOD_EDGE_MAP = [
        { scale: 1.0, edges: 5, hoursThreshold: 60 },
        { scale: 1.2, edges: 20, hoursThreshold: 20 },
        { scale: 2.5, edges: 50, hoursThreshold: 4 },
        { scale: 3.2, edges: 50, hoursThreshold: 0 },

        { scale: Infinity, edges: 100, hoursThreshold: 0 }
    ];

    const getLod = (s: number) => {
        for (const entry of LOD_EDGE_MAP) {
            if (s <= entry.scale) return entry;
        }
        return LOD_EDGE_MAP[LOD_EDGE_MAP.length - 1];
    };

    const clamp = (value: number, min: number, max: number): number => {
        return Math.min(max, Math.max(min, value));
    };

    const RENDER_GRAPH_URL = '/render-graph.json';

    let nodes: Node[] = [];
    let edges: RenderEdge[] = [];
    let nodeById = new Map<string, Node>();
    let adjacency = new Map<string, Array<{ id: string; weight: number }>>();
    let worldBounds: { minX: number; maxX: number; minY: number; maxY: number } | null = null;
    let hasFitToScreen = false;

    const computeWorldBounds = (items: Node[]) => {
        if (items.length === 0) return null;
        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        for (const n of items) {
            const r = Math.max(1, n.radius) * 20;
            minX = Math.min(minX, n.x - r);
            maxX = Math.max(maxX, n.x + r);
            minY = Math.min(minY, n.y - r);
            maxY = Math.max(maxY, n.y + r);
        }
        return { minX, maxX, minY, maxY };
    };

    const rebuildIndexes = () => {
        nodeById = new Map(nodes.map((n) => [n.id, n]));
        const nextAdj = new Map<string, Array<{ id: string; weight: number }>>();
        for (const n of nodes) nextAdj.set(n.id, []);
        for (const e of edges) {
            if (!nextAdj.has(e.source) || !nextAdj.has(e.target)) continue;
            nextAdj.get(e.source)!.push({ id: e.target, weight: e.weight });
            nextAdj.get(e.target)!.push({ id: e.source, weight: e.weight });
        }
        for (const arr of nextAdj.values()) {
            arr.sort((a, b) => b.weight - a.weight);
        }
        adjacency = nextAdj;
    };

    const loadRenderData = async () => {
        const res = await fetch(RENDER_GRAPH_URL);
        if (!res.ok) {
            throw new Error(`Failed to load ${RENDER_GRAPH_URL}: ${res.status} ${res.statusText}`);
        }
        const renderData = (await res.json()) as RenderData;
        nodes = renderData.nodes;
        edges = renderData.edges;
        rebuildIndexes();
        worldBounds = computeWorldBounds(nodes);
    };

    const worldToScreen = (wx: number, wy: number) => {
        return [(wx + offsetX) * scale, (wy + offsetY) * scale];
    };

    const screenToWorld = (sx: number, sy: number) => {
        return [sx / scale - offsetX, sy / scale - offsetY];
    };

    const draw = () => {
        if (!ctx || !canvas) return;
        const dpr = window.devicePixelRatio || 1;
        ctx.save();
        ctx.scale(dpr, dpr);
        // background
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        // determine LOD
        const lod = getLod(scale);

        // draw edges first (limited per-node by LOD)
        ctx.lineWidth = Math.max(0.5, 1 * Math.min(1, scale));
        ctx.strokeStyle = 'rgba(200,200,255,0.4)';

        const visibleNodes = new Set<string>();
        const screenPosByNode = new Map<string, [number, number]>();
        for (const n of nodes) {
            if (n.hours < lod.hoursThreshold) continue;
            const [sx, sy] = worldToScreen(n.x, n.y);
            const drawRadius = Math.max(1, n.radius) * scale * 10;
            if (
                sx + drawRadius < 0 ||
                sx - drawRadius > width ||
                sy + drawRadius < 0 ||
                sy - drawRadius > height
            ) {
                continue;
            }
            visibleNodes.add(n.id);
            screenPosByNode.set(n.id, [sx, sy]);
        }

        const drawnPairs = new Set<string>();

        for (const n of nodes) {
            if (!visibleNodes.has(n.id)) continue;
            const adj = adjacency.get(n.id) ?? [];
            const take = Math.min(lod.edges, adj.length);
            const sourcePos = screenPosByNode.get(n.id);
            if (!sourcePos) continue;
            const [sx, sy] = sourcePos;
            for (let i = 0; i < take; i++) {
                const neighbor = adj[i];
                if (!visibleNodes.has(neighbor.id)) continue;

                const pairKey = n.id < neighbor.id ? `${n.id}:${neighbor.id}` : `${neighbor.id}:${n.id}`;
                if (drawnPairs.has(pairKey)) continue;
                drawnPairs.add(pairKey);

                const targetPos = screenPosByNode.get(neighbor.id);
                if (!targetPos) continue;
                const [tx, ty] = targetPos;

                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(tx, ty);
                ctx.stroke();
            }
        }

        // draw nodes
        for (const n of nodes) {
            if (!visibleNodes.has(n.id)) continue;
            const pos = screenPosByNode.get(n.id);
            if (!pos) continue;
            const [sx, sy] = pos;
            const r = Math.max(1, n.radius) * scale * 10;
            ctx.beginPath();
            ctx.fillStyle = colorlist[n.radius*10 % colorlist.length];
            ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.fill();
        }

        // hovered node highlight and bring its edges
        const hovered = get(hoveredNode);
        if (hovered) {
            const [hsx, hsy] = worldToScreen(hovered.x, hovered.y);
            ctx.beginPath();
            ctx.fillStyle = 'rgba(255,240,200,0.98)';
            ctx.arc(hsx, hsy, Math.max(6, hovered.radius * scale * 10 * 1.6), 0, Math.PI * 2);
            ctx.fill();

            // draw all incident edges for hovered node (and render neighbor nodes even if normally culled)
            ctx.strokeStyle = 'rgba(255,200,120,0.95)';
            ctx.lineWidth = Math.max(1, 1.5 * Math.min(2, scale));
            const neighbors = adjacency.get(hovered.id) ?? [];
            for (const nei of neighbors) {
                const t = nodeById.get(nei.id);
                if (!t) continue;
                const [tx, ty] = worldToScreen(t.x, t.y);
                ctx.beginPath();
                ctx.moveTo(hsx, hsy);
                ctx.lineTo(tx, ty);
                ctx.stroke();
            }

            // render neighbor nodes as highlighted small circles (visible even when LOD would hide them)
            for (const nei of neighbors) {
                const t = nodeById.get(nei.id);
                if (!t) continue;
                const [tx, ty] = worldToScreen(t.x, t.y);
                // cull if off-screen
                if (tx < -40 || tx > width + 40 || ty < -40 || ty > height + 40) continue;
                const nr = Math.max(2, (Math.max(1, t.radius) * 10) * scale * 0.6);
                ctx.beginPath();
                ctx.fillStyle = 'rgba(180,220,255,0.95)';
                ctx.arc(tx, ty, nr, 0, Math.PI * 2);
                ctx.fill();
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(120,160,200,0.9)';
                ctx.stroke();
            }
        }

        ctx.restore();
    };

    let raf = 0;
    const scheduleDraw = () => {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => draw());
    };
    let mobileDevice = $state(false);
    onMount(async () => {
        try {
            await loadRenderData();
        } catch (err) {
            console.error('Unable to load render graph data.', err);
        }
        height = window.innerHeight;
        width = window.innerWidth;
        if(height>width){
            console.log("Mobile Device Detected: Adjusting node sizes for better visibility");
            mobileDevice = true
        }
        if (!canvas) return;
        const canvasEl = canvas;
        ctx = canvasEl.getContext('2d');
        const fitToScreen = () => {
            if (!worldBounds) return;
            const boundsWidth = Math.max(1, worldBounds.maxX - worldBounds.minX);
            const boundsHeight = Math.max(1, worldBounds.maxY - worldBounds.minY);
            const fitScale = Math.min(width / boundsWidth, height / boundsHeight);
            minScale = fitScale;

            scale = minScale+0.05;
            const extraX = width / scale - boundsWidth;
            const extraY = height / scale - boundsHeight;
            offsetX = -worldBounds.minX + extraX / 2;
            offsetY = -worldBounds.minY + extraY / 2;
            hasFitToScreen = true;
        };

        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            width = Math.floor(window.innerWidth);
            height = Math.floor(window.innerHeight);
            canvasEl.width = Math.floor(width * dpr);
            canvasEl.height = Math.floor(height * dpr);
            canvasEl.style.width = width + 'px';
            canvasEl.style.height = height + 'px';
            fitToScreen();
            scheduleDraw();
        };

        resize();
        window.addEventListener('resize', resize);

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const zoomIntensity = 0.0018;
            const delta = -e.deltaY;
            const rect = canvasEl.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const [wx, wy] = screenToWorld(mx, my);

            const newScale = clamp(scale * Math.exp(delta * zoomIntensity), minScale, maxScale);
            // keep point under mouse stable: compute new offset so world point stays under mouse
            offsetX = mx / newScale - wx;
            offsetY = my / newScale - wy;
            scale = newScale;
            scheduleDraw();
        };

        const onPointerDown = (e: PointerEvent) => {
            isPanning = true;
            lastPanX = e.clientX;
            lastPanY = e.clientY;
            canvasEl.setPointerCapture(e.pointerId);
        };

        const onPointerMove = (e: PointerEvent) => {
            if (isPanning) {
                const dx = (e.clientX - lastPanX) / scale;
                const dy = (e.clientY - lastPanY) / scale;
                offsetX += dx;
                offsetY += dy;
                lastPanX = e.clientX;
                lastPanY = e.clientY;
                scheduleDraw();
            }

            // hover detection: screen-space scan so hover works even when zoomed out
                const rect = canvasEl.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                let found: Node | null = null;
                // iterate nodes and check screen-space distance; stop at first hit
                for (const n of nodes) {
                    const [sx, sy] = worldToScreen(n.x, n.y);
                    const dxs = mx - sx;
                    const dys = my - sy;
                    const distScreen = Math.sqrt(dxs * dxs + dys * dys);
                    const pickRadius = Math.max(6, (Math.max(1, n.radius) * 10) * scale);
                    if (distScreen <= pickRadius) {
                        found = n;
                        break;
                    }
                }
                hoveredNode.set(found);
                hoverScreenX.set(mx);
                hoverScreenY.set(my);
            scheduleDraw();
        };

        const onPointerUp = (e: PointerEvent) => {
            isPanning = false;
            try { canvasEl.releasePointerCapture(e.pointerId); } catch {}
        };

        canvasEl.addEventListener('wheel', onWheel, { passive: false });
        canvasEl.addEventListener('pointerdown', onPointerDown);
        canvasEl.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);

        scheduleDraw();

        onDestroy(() => {
            window.removeEventListener('resize', resize);
            canvasEl.removeEventListener('wheel', onWheel);
            canvasEl.removeEventListener('pointerdown', onPointerDown);
            canvasEl.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            if (raf) cancelAnimationFrame(raf);
        });
    });
</script>

<canvas bind:this={canvas} id="myCanvas" style="background:#000000; display:block"></canvas>

    <NodeOverlay hoveredNode={$hoveredNode}  />

<style>
*{
    padding:0;
    margin:0;
}
    #myCanvas {
        height: 100vh;
        width: 100vw;
        touch-action: none;
        cursor: grab;
    }

    #myCanvas:active {
        cursor: grabbing;
    }


</style>