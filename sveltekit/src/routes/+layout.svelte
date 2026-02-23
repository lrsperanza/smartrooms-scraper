<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/stores';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<nav class="site-nav">
	<a href="/" class="site-nav-link" class:active={$page.url.pathname === '/'}>SmartRooms</a>
	<a
		href="/vitaboum"
		class="site-nav-link"
		class:active={$page.url.pathname === '/vitaboum'}>Vitaboum</a
	>
</nav>

{@render children()}
