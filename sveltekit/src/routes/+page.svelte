<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { groupByRoom, groupByRegion } from '$lib/dataProcessor';
	import type { DataEntry } from '$lib/dataProcessor';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import RoomCard from '$lib/components/RoomCard.svelte';
	import RegionCard from '$lib/components/RegionCard.svelte';

	type ViewMode = 'individual' | 'region';

	let { data } = $props();

	let downloadLoading = $state(false);
	let viewMode = $state<ViewMode>('individual');

	async function handleDownload() {
		downloadLoading = true;
		try {
			const res = await fetch('/api/download', { method: 'POST' });
			if (!res.ok) throw new Error(await res.text());
			await invalidateAll();
		} finally {
			downloadLoading = false;
		}
	}

	const entries = $derived((data?.entries ?? []) as DataEntry[]);
	const hasData = $derived(!!data?.hasData);

	const roomsByKey = $derived(groupByRoom(entries));
	const sortedRooms = $derived(
		(() => {
			const list = Array.from(roomsByKey.entries());
			list.sort(([, a], [, b]) => {
				const u = a.unitName.localeCompare(b.unitName);
				if (u !== 0) return u;
				return a.roomLabel.localeCompare(b.roomLabel);
			});
			return list;
		})()
	);

	const regionsByKey = $derived(groupByRegion(entries));
	const sortedRegions = $derived(
		(() => {
			const list = Array.from(regionsByKey.entries());
			list.sort(([a], [b]) => a.localeCompare(b));
			return list;
		})()
	);
</script>

{#if !hasData}
	<EmptyState onDownload={handleDownload} loading={downloadLoading} />
{:else}
	<header class="dashboard-header">
		<h1 class="dashboard-title">SmartRooms Dashboard</h1>
		<div class="dashboard-controls">
			<div class="view-toggle" role="radiogroup" aria-label="Modo de visualização">
				<button
					class="view-toggle-btn"
					class:active={viewMode === 'individual'}
					onclick={() => (viewMode = 'individual')}
					type="button"
					role="radio"
					aria-checked={viewMode === 'individual'}
				>
					Por Sala
				</button>
				<button
					class="view-toggle-btn"
					class:active={viewMode === 'region'}
					onclick={() => (viewMode = 'region')}
					type="button"
					role="radio"
					aria-checked={viewMode === 'region'}
				>
					Por Região
				</button>
			</div>
			<button
				class="dashboard-update-button"
				onclick={handleDownload}
				disabled={downloadLoading}
				type="button"
			>
				{#if downloadLoading}
					<span class="spinner" aria-hidden="true"></span>
					<span>A atualizar…</span>
				{:else}
					<span>Atualizar Dados</span>
				{/if}
			</button>
		</div>
	</header>

	{#if viewMode === 'individual'}
		<div class="dashboard-grid">
			{#each sortedRooms as [roomKey, roomData]}
				<RoomCard {roomKey} {roomData} />
			{/each}
		</div>
	{:else}
		<div class="dashboard-regions">
			{#each sortedRegions as [, regionData]}
				<RegionCard {regionData} />
			{/each}
		</div>
	{/if}
{/if}
