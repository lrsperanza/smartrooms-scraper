<script lang="ts">
	let { onDownload, loading = false } = $props();
</script>

<div class="empty-state">
	<div class="empty-state-card">
		<div class="empty-state-icon" aria-hidden="true">📊</div>
		<h2 class="empty-state-title">Nenhum dado local</h2>
		<p class="empty-state-message">
			Baixe os ficheiros JSON do armazenamento para visualizar a ocupação por sala e data.
		</p>
		<button
			class="empty-state-button"
			onclick={onDownload}
			disabled={loading}
			type="button"
		>
			{#if loading}
				<span class="spinner" aria-hidden="true"></span>
				<span>A carregar…</span>
			{:else}
				<span>Listar e transferir dados</span>
			{/if}
		</button>
	</div>
</div>
