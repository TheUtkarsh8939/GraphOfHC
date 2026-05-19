<script>
        let colorlist = [
        '#f94144', '#fa2bbc', '#c0db11', '#f9844a', '#f9c74f',
        '#90be6d', '#43aa8b', '#4d908e', '#577590', '#277da1',
        "#af0020", "#f2efe0", "#7fefbd","#cba135", "#f78fb3", "#e056fd", "#686de0", "#ff6b81", "#ff9ff3", "#f368e0",
    ];
</script>
<div class="grid">
    {#each colorlist as color}
        <div class="color-box" style={`background-color: ${color};`}></div>
    {/each}
</div>
<style>
    .grid{
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(50px, 1fr));
        gap: 10px;
        padding: 20px;
    }
    .color-box{
        width: 100%;
        padding-top: 100%;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        border: 1px solid rgba(255,255,255,0.1);
    }
</style>