<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { groupByRoom, computeMonthlyEstimation, VITABOUM_HOURLY_RATE } from '$lib/vitaboumDataProcessor';
	import type { VitaboumReservation } from '$lib/vitaboumDataProcessor';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import VitaboumRoomCard from '$lib/components/VitaboumRoomCard.svelte';

	let { data } = $props();

	let downloadLoading = $state(false);

	async function handleDownload() {
		downloadLoading = true;
		try {
			const res = await fetch('/api/download-vitaboum', { method: 'POST' });
			if (!res.ok) throw new Error(await res.text());
			await invalidateAll();
		} finally {
			downloadLoading = false;
		}
	}

	const reservations = $derived((data?.reservations ?? []) as VitaboumReservation[]);
	const hasData = $derived(!!data?.hasData);

	const roomsByKey = $derived(groupByRoom(reservations));
	const sortedRooms = $derived(
		(() => {
			const list = Array.from(roomsByKey.entries());
			list.sort(([a], [b]) => a.localeCompare(b));
			return list;
		})()
	);

	const totalReservations = $derived(reservations.length);
	const totalHours = $derived(
		reservations.reduce((s, r) => s + r.durationMinutes, 0) / 60
	);

	const allRoomEstimations = $derived(
		Array.from(roomsByKey.values()).map((r) => computeMonthlyEstimation(r.dailyData))
	);
	const totalMonthlyRevenue = $derived(
		allRoomEstimations.reduce((s, e) => s + e.total.revenue, 0)
	);
	const totalMonthlyHours = $derived(
		allRoomEstimations.reduce((s, e) => s + e.total.hours, 0)
	);

	const formattedMonthlyRevenue = $derived(
		totalMonthlyRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
	);
</script>

{#if !hasData}
	<EmptyState onDownload={handleDownload} loading={downloadLoading} />
{:else}
	<header class="dashboard-header">
		<h1 class="dashboard-title">Vitaboum Dashboard</h1>
		<div class="dashboard-controls">
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

	<div class="vitaboum-summary">
		<div class="summary-card">
			<span class="summary-value">{roomsByKey.size}</span>
			<span class="summary-label">Salas</span>
		</div>
		<div class="summary-card">
			<span class="summary-value">{totalReservations}</span>
			<span class="summary-label">Reservas</span>
		</div>
		<div class="summary-card">
			<span class="summary-value">{totalHours.toFixed(1)}h</span>
			<span class="summary-label">Horas reservadas</span>
		</div>
		<div class="summary-card">
			<span class="summary-value">{totalMonthlyHours.toFixed(0)}h</span>
			<span class="summary-label">Horas/mês (est.)</span>
		</div>
		<div class="summary-card summary-card-highlight">
			<span class="summary-value">{formattedMonthlyRevenue}</span>
			<span class="summary-label">Receita/mês (est.)</span>
		</div>
	</div>

	<div class="dashboard-grid">
		{#each sortedRooms as [, roomData]}
			<VitaboumRoomCard {roomData} />
		{/each}
	</div>
{/if}
