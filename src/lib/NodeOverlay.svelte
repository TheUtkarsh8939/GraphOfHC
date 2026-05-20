<script lang="ts">

import DOMPurify from "dompurify";
  // Use $props() for runes mode instead of `export let`
  const props = $props();
  const defaultDescription =  `A graph of all projects ever submitted to Hackclub's Unified Database, 
  each circle here represents a project, and the lines between them represent sharedness. 
  Hover on a node to see more information about the project, and click on the edges to see how projects are related. `;
  
</script>

<div class="node-overlay  w-2/5 min-w-50  bg-[#000000d0] border border-gray-700 text-white" style="right: 40px; top: 12px; position: fixed; pointer-events: auto; ">
<div class="w-full h-14 border-b border-gray-500 bg-black flex items-center px-4 text-2xl
">{props.hoveredNode?.name || "Graph Of Hack Club"} <div class="badge">{props.hoveredNode?.ysws}</div></div>
<div class="description px-4 py-6 min-h-50 text-md">
  {@html props.hoveredNode?.description || DOMPurify.sanitize(defaultDescription)}
  
</div>
<div class="border-t border-gray-500 px-4 flex items-center w-full h-10 text-gray-500">
  Made with ❤️ by &nbsp; <a href="https://theutkarsh8939.dev" class="text-gray-500">Utkarsh</a>
</div>
  <!-- <div class="flex gap-2 items-center"> -->
    <!-- <div class="node-title">{props.hoveredNode?.name}</div>
  <div class="node-sub">{props.hoveredNode?.ysws}</div>
  </div>
  <div class="node-hours">Hours: {props.hoveredNode?.hours}</div>
  {#if props.hoveredNode?.description}
    <div class="node-desc">{props.hoveredNode.description}</div>
  {/if}
    {#if props.hoveredNode?.code_url}
    <div class="node-desc">Code: {props.hoveredNode.code_url}</div>
  {/if}
      {#if props.hoveredNode?.demo_url}
    <div class="node-desc">Demo: {props.hoveredNode.demo_url}</div>
  {/if} -->
</div>

<style>
  
</style>
