<script lang="ts">
	import type { RegionData } from '$lib/dataProcessor';
	import { computeMonthlyEstimation } from '$lib/dataProcessor';
	import OccupationChart from './OccupationChart.svelte';
	import MonthlyEstimation from './MonthlyEstimation.svelte';

	let { regionData } = $props<{ regionData: RegionData }>();
</script>

<article class="region-card">
	<header class="region-card-header">
		<h2 class="region-card-title">{regionData.unitName}</h2>
		<p class="region-card-subtitle">
			{regionData.roomTypes.length}
			{regionData.roomTypes.length === 1 ? 'tipo de sala' : 'tipos de sala'}
		</p>
	</header>
	<div class="region-card-body">
		{#each regionData.roomTypes as rt}
			{@const estimation = computeMonthlyEstimation(rt.dataPoints)}
			<section class="region-room-type">
				<h3 class="region-room-type-title">{rt.roomType}</h3>
				<div class="region-room-type-content">
					<div class="region-room-type-chart">
						<OccupationChart dataPoints={rt.dataPoints} />
					</div>
					<div class="region-room-type-estimation">
						<MonthlyEstimation {estimation} />
					</div>
				</div>
			</section>
		{/each}
	</div>
</article>
