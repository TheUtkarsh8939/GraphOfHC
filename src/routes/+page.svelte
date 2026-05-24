<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import NodeOverlay from '$lib/NodeOverlay.svelte';
	import { Slider } from '$lib/components/ui/slider/index.js';
	let loading = $state(true);
	import { COLORS } from '$lib/colors';
	let colorlist = [
		'#f94144',
		'#fa2bbc',
		'#c0db11',
		'#f9844a',
		'#f9c74f',
		'#90be6d',
		'#43aa8b',
		'#4d908e',
		'#8E44AD',
		'#277da1',
		'#af0020',
		'#f2efe0',
		'#7fefbd',
		'#cba135',
		'#f78fb3',
		'#e056fd',
		'#686de0',
		'#ff6b81',
		'#ff9ff3',
		'#f368e0',
		'#FF5733',
		'#33FF57',
		'#3357FF',
		'#F033FF',
		'#33FFF0',
		'#FF3333',
		'#33FF85',
		'#577590',
		'#5733FF',
		'#FFC300',
		'#C70039',
		'#900C3F',
		'#581845',
		'#2C3E50',
		'#2C3E50',
		'#85929E',
		'#1ABC9C',
		'#16A085',
		'#2ECC71',
		'#27AE60',
		'#9B59B6',
		'#3498DB',
		'#2980B9',
		'#D35400',
		'#34495E',
		'#F1C40F',
		'#E67E22',
		'#0E6251',
		'#E74C3C',
		'#C0392B',
		'#7F8C8D',
		'#ECF0F1',
		'#FFFFFF',
		'#00ff23',
		'#BDC3C7',
		'#95A5A6',
		'#6E2C00',
		'#F39C12',
		'#7D6608',
		'#117864',
		'#D4AC0D',
		'#1A5276',
		'#154360',
		'#512E5F',
		'#4A235A',
		'#7B241C',
		'#78281F',
		'#4D5656',
		'#626567',
		'#273746'
	];
	interface RenderNode {
		id: string;
		ysws: string;
		code_url: string;
		description: string;
		demo_url: string;
		hours: number | string;
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

	//Customization options
	let lightMode = $state(false);
	let useYswsColor = $state(false);
	let edgeWeight = $state(0.3);
	let nodeSize = $state(6);
	let disableLod = $state(false);
	let useAlternateFile = $state(false);

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
		if (disableLod) {
			return { scale: Infinity, edges: 100, hoursThreshold: 0 };
		}
		for (const entry of LOD_EDGE_MAP) {
			if (s <= entry.scale) return entry;
		}
		return LOD_EDGE_MAP[LOD_EDGE_MAP.length - 1];
	};

	const clamp = (value: number, min: number, max: number): number => {
		return Math.min(max, Math.max(min, value));
	};

	let RENDER_GRAPH_URL = $derived(useAlternateFile? "render-graph-alternate.json":"/render-graph.json");

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

	const getNumericHours = (node: Node): number => {
		if (node.hours === 'null' || (typeof node.hours === 'string' && node.hours.includes('null'))) {
			return 1;
		}
		return typeof node.hours === 'number' ? node.hours : Number(node.hours);
	};

	const findVisibleNodeAtScreen = (mx: number, my: number): Node | null => {
		const lod = getLod(scale);
		for (const n of nodes) {
			const hours = getNumericHours(n);
			if (hours < lod.hoursThreshold || !hours) continue;
			const [sx, sy] = worldToScreen(n.x, n.y);
			const drawRadius = Math.max(1, n.radius) * scale * nodeSize;
			if (
				sx + drawRadius < 0 ||
				sx - drawRadius > width ||
				sy + drawRadius < 0 ||
				sy - drawRadius > height
			) {
				continue;
			}
			const dxs = mx - sx;
			const dys = my - sy;
			const distScreen = Math.sqrt(dxs * dxs + dys * dys);
			const pickRadius = Math.max(6, Math.max(1, n.radius) * nodeSize * scale);
			if (distScreen <= pickRadius) return n;
		}
		return null;
	};

	const nodeClicks = (node: Node) => {
		node;
	};

	const draw = () => {
		if (!ctx || !canvas) return;
		const dpr = window.devicePixelRatio || 1;
		ctx.save();
		ctx.scale(dpr, dpr);
		// background
		ctx.fillStyle = lightMode ? '#ffffff' : '#000000';
		ctx.fillRect(0, 0, width, height);

		// determine LOD
		const lod = getLod(scale);

		// draw edges first (limited per-node by LOD)
		ctx.lineWidth = Math.max(0.5, 1 * Math.min(1, scale));

		const visibleNodes = new Set<string>();
		const screenPosByNode = new Map<string, [number, number]>();
		for (const n of nodes) {
			const hours = getNumericHours(n);
			if (hours < lod.hoursThreshold || !hours) continue;
			const [sx, sy] = worldToScreen(n.x, n.y);
			const drawRadius = Math.max(0.2, n.radius) * scale * nodeSize;
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
				const adjacencyWeight = neighbor.weight;
				if (!targetPos) continue;
				const [tx, ty] = targetPos;
				ctx.strokeStyle = lightMode
					? `rgba(0,0,0,${adjacencyWeight * edgeWeight})`
					: `rgba(255,255,255,${adjacencyWeight * edgeWeight})`;

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
			const r = Math.max(0.2, n.radius) * scale * nodeSize;
			ctx.beginPath();
			//@ts-expect-error
			ctx.fillStyle = useYswsColor
				? COLORS[n.ysws] || '#6b7280'
				: colorlist[(n.radius * 200) % colorlist.length];
			ctx.arc(sx, sy, r, 0, Math.PI * 2);
			ctx.fill();
		}

		// hovered node highlight and bring its edges
		const hovered = get(hoveredNode);
		if (hovered) {
			const [hsx, hsy] = worldToScreen(hovered.x, hovered.y);
			ctx.beginPath();
			ctx.fillStyle = lightMode ? 'rgba(0,0,0,0.98)' : 'rgba(255,240,200,0.98)';
			ctx.arc(hsx, hsy, Math.max(6, hovered.radius * scale * 10 * 1.6), 0, Math.PI * 2);
			ctx.fill();

			// draw all incident edges for hovered node (and render neighbor nodes even if normally culled)
			ctx.strokeStyle = lightMode ? 'rgba(0,0,0,0.95)' : 'rgba(255,200,120,0.95)';
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
				const nr = Math.max(2, Math.max(1, t.radius) * 10 * scale * 0.6);
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
		if (height > width) {
			console.log('Mobile Device Detected: Adjusting node sizes for better visibility');
			mobileDevice = true;
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

			scale = minScale;
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

		let pointerMoved = false;
		let pointerDownX = 0;
		let pointerDownY = 0;

		const onPointerDown = (e: PointerEvent) => {
			isPanning = true;
			pointerMoved = false;
			pointerDownX = e.clientX;
			pointerDownY = e.clientY;
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
				if (Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY) > 4) {
					pointerMoved = true;
				}
				scheduleDraw();
			}

			// hover detection: screen-space scan so hover works even when zoomed out
			const rect = canvasEl.getBoundingClientRect();
			const mx = e.clientX - rect.left;
			const my = e.clientY - rect.top;
			const found = findVisibleNodeAtScreen(mx, my);
			hoveredNode.set(found);
			hoverScreenX.set(mx);
			hoverScreenY.set(my);
			scheduleDraw();
		};

		const onPointerUp = (e: PointerEvent) => {
			isPanning = false;
			if (!pointerMoved) {
				const rect = canvasEl.getBoundingClientRect();
				const mx = e.clientX - rect.left;
				const my = e.clientY - rect.top;
				const hit = findVisibleNodeAtScreen(mx, my);
				if (hit) nodeClicks(hit);
			}
			try {
				canvasEl.releasePointerCapture(e.pointerId);
			} catch {}
		};

		canvasEl.addEventListener('wheel', onWheel, { passive: false });
		canvasEl.addEventListener('pointerdown', onPointerDown);
		canvasEl.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerUp);

		loading = false;
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
	function toggleLightMode() {
		lightMode = !lightMode;
		scheduleDraw();
	}
	$effect(() => {
		console.log('Light mode changed:', lightMode);
		console.log('Color By Ysws:', useYswsColor);
		console.log('Edge Weight:', edgeWeight);
		console.log('Node Size:', nodeSize);
		console.log('Disable LOD:', disableLod);
		scheduleDraw();
	});
	$effect(()=> {
		console.log('Use Alternate File:', useAlternateFile);
		loading = true;
		loadRenderData().then(() => {loading = false;
		scheduleDraw();}).catch((err) => {
			console.error('Error loading render data:', err);
			loading = false;
		});
		
	})
	let closed = $state(true);
</script>

<div class="screen {lightMode ? '' : 'dark'}">
	{#if loading}
		<div
			class="absolute flex items-center justify-center h-screen w-screen bg-black text-white p-0 z-500 flex-col gap-4"
		>
			<div class="size-20 border-3 border-gray-600 border-t-white rounded-full loader"></div>
			<span>Loading the constellation..</span>
		</div>
	{/if}
	<canvas
		bind:this={canvas}
		id="myCanvas"
		style="background:{lightMode ? '#ffffff' : '#000000'}; display:block"
	></canvas>
	<div
		class="filter absolute top-4 left-4 {lightMode
			? 'border-black'
			: 'border-gray-600'} rounded-sm z-10 {lightMode
			? 'text-gray-800'
			: 'text-white'} cursor-pointer {lightMode ? 'bg-gray-200' : 'bg-black'}  border"
	>
		<button
			onclick={() => (closed = !closed)}
			class="filter-bar relative h-12 items-center justify-center flex text-xl gap-2
		{lightMode ? 'border-black' : 'border-gray-600'} border-b"
		>
			<i class="fa-solid fa-gear"></i>
			<span class="text-[15px]">Adjust settings</span>
			<div
				aria-label="Toggle description"
				class="text-white absolute right-3 animate {closed ? '' : 'rotate-180'}"
			>
				<i class="fa-solid fa-angle-down text-[15px]"></i>
			</div>
		</button>
		<div
			style="padding:{closed ? '0' : '10px 20px'}"
			class="options none flex-col gap-3 {closed ? 'opacity-0' : 'opacity-100'} {closed
				? 'height-0'
				: 'height-auto'}"
		>
			<div class="opt1 gap-3 {closed ? 'hidden' : 'flex'} items-center">
				<input type="checkbox" name="" id="" bind:checked={useYswsColor} /><span>Color By YSWS</span
				>
			</div>
			<div class="opt2 gap-3 {closed ? 'hidden' : 'flex'} items-center">
				<input type="checkbox" name="" id="" bind:checked={lightMode} /><span>Light Mode</span>
			</div>
			<br class={closed ? 'hidden' : 'flex'} />
			<div class="opt3 {closed ? 'hidden' : 'flex'} flex-col h-10 flex justify-start">
				<div>Node Size:</div>
				<Slider type="single" bind:value={nodeSize} max={20} min={1} step={1} class="w-full" />
			</div>
			<div class="opt3 {closed ? 'hidden' : 'flex'} flex-col h-10 flex justify-start">
				<div>Edge Weight:</div>
				<Slider type="single" bind:value={edgeWeight} max={1} step={0.1} class="w-full" />
			</div>
			<br class={closed ? 'hidden' : 'flex'} />

			<div class="opt2 gap-3 {closed ? 'hidden' : 'flex'} items-center">
				<input type="checkbox" name="" id="" bind:checked={disableLod} /><span>Disable LOD</span>
			</div>
			<div class="opt2 gap-3 {closed ? 'hidden' : 'flex'} items-center">
				<input type="checkbox" name="" id="" bind:checked={useAlternateFile} /><span>Use Alternate File</span>
			</div>
		</div>
	</div>
	<NodeOverlay hoveredNode={$hoveredNode} {lightMode} {toggleLightMode} />
	<div class="bottom-5 absolute w-full flex items-center justify-center text-gray-400">
		<div class="controls h-10 items-center gap-2 flex">
			<svg
				class="size-[clamp(20px,2vw,40px)]"
				version="1.1"
				id="Capa_1"
				xmlns="http://www.w3.org/2000/svg"
				xmlns:xlink="http://www.w3.org/1999/xlink"
				x="0px"
				y="0px"
				viewBox="0 0 416.031 416.031"
				style="enable-background:new 0 0 416.031 416.031;"
				xml:space="preserve"
			>
				<path
					d="M221.605,0h-31.913C123.743,0,72.083,53.745,72.083,122.356v171.306c0,68.618,51.66,122.369,117.609,122.369h31.913
	c67.46,0,122.343-54.894,122.343-122.369V122.356C343.948,54.889,289.065,0,221.605,0z M206.781,64.12h2.469c3.859,0,7,3.14,7,7
	v49.833c0,3.86-3.141,7-7,7h-2.469c-3.859,0-7-3.14-7-7V71.12C199.781,67.26,202.922,64.12,206.781,64.12z M327.948,293.662
	c0,58.652-47.705,106.369-106.343,106.369h-31.913c-56.978,0-101.609-46.723-101.609-106.369V122.356
	C88.083,62.718,132.715,16,189.692,16h10.225v33.167c-9.34,2.927-16.136,11.661-16.136,21.954v49.833
	c0,10.292,6.796,19.027,16.136,21.953v41.166c0,4.418,3.582,8,8,8s8-3.582,8-8v-41.108c9.441-2.865,16.333-11.647,16.333-22.011
	V71.12c0-10.364-6.892-19.146-16.333-22.012V16h5.688c58.638,0,106.343,47.711,106.343,106.356V293.662z"
					fill="#99a1af"
				/>
			</svg> <span class="">Use Scrollwheel to Zoom, Drag to Move Around </span>
		</div>
	</div>
</div>

<style>
	.loader {
		animation: spin 1s linear infinite;
	}
	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}
	* {
		padding: 0;
		margin: 0;
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
	.filter-bar {
		padding: 10px 20px;
		padding-right: 120px;
	}
	.options {
		padding-left: 20px;
		transition: all 0.3s ease;
	}
	.animate {
		transition: all 0.3s ease;
	}
</style>
