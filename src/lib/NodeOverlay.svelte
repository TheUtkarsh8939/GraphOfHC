<script lang="ts">
  // Use $props() for runes mode instead of `export let`
  const props = $props();
</script>

<div class="node-overlay" style="left: {props.x + 12}px; top: {props.y + 12}px; position: fixed; pointer-events: auto; font-size:70px;">
  <div class="node-title">{props.hoveredNode?.name}</div>
  <div class="node-sub">{props.hoveredNode?.ysws}</div>
  <div class="node-hours">Hours: {props.hoveredNode?.hours}</div>
  {#if props.hoveredNode?.description}
    <div class="node-desc">{props.hoveredNode.description}</div>
  {/if}
</div>

<style>
 .node-overlay {
  background: rgba(0, 0, 0, 0.9);
  color: #e6f0ff;
  padding: 10px;
  border-radius: 6px;
  pointer-events: none;
  max-width: 1400px;
  height: auto;
  overflow: visible;
  z-index: 1000;
  font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;
  font-size: 70px;
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
  max-height: 5.5em;
  overflow: hidden;
 }
</style>
