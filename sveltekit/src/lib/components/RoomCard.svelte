<script lang="ts">
	import type { RoomData } from '$lib/dataProcessor';
	import { computeMonthlyEstimation } from '$lib/dataProcessor';
	import OccupationChart from './OccupationChart.svelte';
	import MonthlyEstimation from './MonthlyEstimation.svelte';

	let { roomKey, roomData } = $props<{ roomKey: string; roomData: RoomData }>();

	const estimation = $derived(computeMonthlyEstimation(roomData.dataPoints));
</script>

<article class="room-card">
	<header class="room-card-header">
		<h2 class="room-card-title">{roomData.roomLabel}</h2>
		<p class="room-card-subtitle">{roomData.unitName}</p>
	</header>
	<div class="room-card-body">
		<div class="room-card-chart">
			<OccupationChart dataPoints={roomData.dataPoints} />
		</div>
		<div class="room-card-estimation">
			<MonthlyEstimation estimation={estimation} />
		</div>
	</div>
</article>
