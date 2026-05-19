<script lang="ts">
  // Use $props() for runes mode instead of `export let`
  const props = $props();
</script>

<div class="node-overlay" style="right: {12}px; top: { 12}px; position: fixed; pointer-events: auto; font-size:70px; ">
  <div class="flex gap-5 items-center">
    <div class="node-title">{props.hoveredNode?.name}</div>
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
  {/if}
</div>

<style>
 .node-overlay {
  background: rgba(0, 0, 0, 0.9);
  color: #e6f0ff;
  padding: 10px;
  border-radius: 6px;
  pointer-events: none;
  min-width: clamp(200px, 30vw, 4400px);
  min-height: clamp(100px, 20vh, 2000px);
  height: auto;
  overflow: visible;
  z-index: 1000;
  font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;
  font-size: 70px;
  border-bottom-left-radius: 70px;
  padding: 40px;
  display: flex;
  flex-direction: column;
  gap:20px;
 }

 .node-title {
  font-weight: 600;
  margin-bottom: 6px;
 }

 .node-sub {
  opacity: 0.95;
  margin-bottom: 6px;
  font-size: 65px;
 }

 .node-hours {
  font-size: 50px;
  color: #cfe6ff;
  margin-bottom: 6px;
 }

 .node-desc {
  font-size: 50px;
  color: #bcd9ff;

  overflow: hidden;
 }
</style>
