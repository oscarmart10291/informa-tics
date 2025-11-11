// backend/src/utils/totales.js
function calcTotalesFromItems(items) {
    // items: [{ cantidad, precioUnit }]
    const total = items.reduce((acc, it) => acc + Number(it.cantidad) * Number(it.precioUnit), 0);
    return { total: Number(total.toFixed(2)) };
    }
    
    
    module.exports = { calcTotalesFromItems };