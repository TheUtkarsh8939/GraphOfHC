<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	let { children } = $props();
	  import "../app.css";
	let isMobile = $state(true)
	onMount(() => {
		isMobile = window.innerWidth < 768;
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>
{#if isMobile}
<div class="w-screen h-screen text-white bg-black absolute z-10 flex flex-col items-center justify-center text-center">This Site is Not made for mobile <br> <button class="underline" onclick={()=>isMobile=false}>Continue Anyways?</button> </div>
{/if}
{@render children()}
