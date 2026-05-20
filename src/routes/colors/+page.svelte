<script>
	let colorlist = [
		'#f94144',
		'#fa2bbc',
		'#c0db11',
		'#f9844a',
		'#f9c74f',
		'#90be6d',
		'#43aa8b',
		'#4d908e',
		'#8E44AD',
		'#277da1',
		'#af0020',
		'#f2efe0',
		'#7fefbd',
		'#cba135',
		'#f78fb3',
		'#e056fd',
		'#686de0',
		'#ff6b81',
		'#ff9ff3',
		'#f368e0',
		'#FF5733',
		'#33FF57',
		'#3357FF',
		'#F033FF',
		'#33FFF0',
		'#FF3333',
		'#33FF85',
		'#577590',
		'#5733FF',
		'#FFC300',
		'#C70039',
		'#900C3F',
		'#581845',
		'#2C3E50',
		'#2C3E50',
		'#85929E',
		'#1ABC9C',
		'#16A085',
		'#2ECC71',
		'#27AE60',
		'#9B59B6',
		'#3498DB',
		'#2980B9',
		'#D35400',
		'#34495E',
		'#F1C40F',
		'#E67E22',
		'#0E6251',
		'#E74C3C',
		'#C0392B',
		'#7F8C8D',
		'#ECF0F1',
		'#FFFFFF',
		'#00ff23',
		'#BDC3C7',
		'#95A5A6',
		'#6E2C00',
		'#F39C12',
		'#7D6608',
		'#117864',
		'#D4AC0D',
		'#1A5276',
		'#154360',
		'#512E5F',
		'#4A235A',
		'#7B241C',
		'#78281F',
		'#4D5656',
		'#626567',
		'#273746'
	];
</script>

<div class="grid">
	{#each colorlist as color}
		<div class="color-box" style={`background-color: ${color};`}></div>
	{/each}
</div>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(50px, 1fr));
		gap: 10px;
		padding: 20px;
	}
	.color-box {
		width: 100%;
		padding-top: 100%;
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(255, 255, 255, 0.1);
	}
</style>
