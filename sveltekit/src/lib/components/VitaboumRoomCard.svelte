<script lang="ts">
	import type { VitaboumRoomData, VitaboumDayPoint } from '$lib/vitaboumDataProcessor';
	import { computeMonthlyEstimation } from '$lib/vitaboumDataProcessor';
	import VitaboumHoursChart from './VitaboumHoursChart.svelte';
	import VitaboumEstimation from './VitaboumEstimation.svelte';

	let { roomData } = $props<{ roomData: VitaboumRoomData }>();

	const estimation = $derived(computeMonthlyEstimation(roomData.dailyData));

	const totalReservations = $derived(
		roomData.dailyData.reduce((s: number, d: VitaboumDayPoint) => s + d.reservationCount, 0)
	);
	const totalHours = $derived(
		roomData.dailyData.reduce((s: number, d: VitaboumDayPoint) => s + d.totalMinutes, 0) / 60
	);
</script>

<article class="room-card">
	<header class="room-card-header">
		<h2 class="room-card-title">{roomData.room}</h2>
		<p class="room-card-subtitle">
			{totalReservations} reservas · {totalHours.toFixed(1)}h no período
		</p>
	</header>
	<div class="room-card-body">
		<div class="room-card-chart">
			<VitaboumHoursChart dailyData={roomData.dailyData} />
		</div>
		<div class="room-card-estimation">
			<VitaboumEstimation {estimation} />
		</div>
	</div>
</article>
