<script lang="ts">
  import { COLORS } from './colors';
	import DOMPurify from 'dompurify';
	// Use $props() for runes mode instead of `export let`
	const props = $props();
	const defaultDescription = `A graph of all projects ever submitted to Hackclub's Unified Database, 
  each circle here represents a project, and the lines between them represent sharedness. 
  Hover on a node to see more information about the project, and click on the edges to see how projects are related. `;
  let closed = $state(true);      
</script>

<div
	class="node-overlay w-3/5 min-w-80 max-w-220 {props.lightMode? 'bg-[#fffffff0]': "bg-[#000000f0]"} border border-gray-700 {props.lightMode? 'text-black': 'text-gray-300'} rounded-lg pointer-events-none  "
	style="right: 40px; top: 12px; position: fixed; pointer-events: auto; "
>
	<div
		class="w-full h-14 border-b border-gray-500 {props.lightMode? 'bg-[#ffffff]': 'bg-[#000000]'} relative flex items-center px-4 text-clamp(16px, 1.5vw, 24px)
"
	>
		{props.hoveredNode?.name || 'Constellation'}
		<div
			class="badge text-[clamp(8px,0.5vw,12px)] ml-4 px-[clamp(8px,0.5vw,16px)] py-1 text-white rounded-full "
			style="background-color: color-mix({//@ts-ignore
			COLORS[props.hoveredNode?.ysws] || '#6b7280'}, black 20%);"
		>
			{props.hoveredNode?.ysws || "Beest"}
		</div>
    <div class="hour-badge text-[clamp(8px,0.5vw,12px)] ml-4 px-[clamp(8px,0.5vw,16px)] py-1 text-white rounded-full" style="background-color: color-mix({//@ts-ignore
			COLORS[props.hoveredNode?.ysws] || '#6b7280'}, #03fcbe 40%);">
      Hours: {props.hoveredNode?.hours || "∞"}
    </div>
    <button aria-label="Toggle description" class="text-white absolute right-4 animate {closed? '' : 'rotate-180'}" onclick={() => closed = !closed}>
      <i class="fa-solid fa-angle-down"></i>
    </button>
	</div>
<div style="height: {closed ? '0' : 'auto'} !important;opacity:{closed?'0':'1'}" class="animate">
  	<div style=" min-height: {closed ? '0' : '200px'}; padding:{closed ? '0' : 'auto'};" class="animate description px-4 py-6  max-h-50 overflow-hidden text-clamp(12px, 1.2vw, 16px) {props.lightMode? 'text-black': 'text-gray-300'}">
		{@html props.hoveredNode?.description || DOMPurify.sanitize(defaultDescription)}
	</div>
	<div class="border-t border-gray-500 px-4 flex items-center w-full h-10 text-gray-500">

		{#if props.hoveredNode?.code_url}
      <a href={props.hoveredNode.code_url} target="_blank" class="underline mr-4">Code</a>
    {/if}
    {#if props.hoveredNode?.demo_url}
      <a href={props.hoveredNode.demo_url} target="_blank" class="underline">Demo</a>
    {/if}
    {#if !props.hoveredNode?.code_url && !props.hoveredNode?.demo_url}
      Made with ❤️ by &nbsp; <a href="https://theutkarsh8939.dev" class="text-gray-500">Utkarsh</a>
    {/if}
	</div>
</div>

</div>

<style>
.animate{
  transition: all 0.3s ease;
}
</style>
