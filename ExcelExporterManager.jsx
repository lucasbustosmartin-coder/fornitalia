import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';
import * as XLSX from 'xlsx';
import { EyeIcon, DocumentArrowDownIcon } from '@heroicons/react/24/outline';

export default function ExcelExporterManager({ user, setCurrentView, pageIcon }) {
  const toast = useToast();
  const [data, setData] = useState([]);
  const [tiposCambio, setTiposCambio] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [sortConfig, setSortConfig] = useState({
    key: 'fecha',
    direction: 'descending',
    secondaryKey: 'rubro',
    tertiaryKey: 'concepto',
  });

  const today = new Date();
  const lastMonth = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  lastMonth.setMonth(lastMonth.getMonth() - 1);

  const formatLocalDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [fechaDesde, setFechaDesde] = useState(formatLocalDate(lastMonth));
  const [fechaHasta, setFechaHasta] = useState(formatLocalDate(today));
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    handleVer();
  }, [user, fechaDesde, fechaHasta]);

  const handleVer = async () => {
    setLoading(true);
    setError(null);
    try {
      const endOfDay = new Date(fechaHasta);
      endOfDay.setDate(endOfDay.getDate() + 1);
      const fechaHastaPlusOneDay = formatLocalDate(endOfDay);

      const pageSize = 1000;

      // 1. Cargar TODOS los Tipos de Cambio con paginación
      let allTc = [];
      let pageTc = 0;
      let tcPageData;
      do {
        const { data, error } = await supabase
          .from('tipos_cambio_global')
          .select('fecha, usd_mep, usd_ccl, usd_oficial')
          .gte('fecha', fechaDesde)
          .lt('fecha', fechaHastaPlusOneDay)
          .order('fecha', { ascending: true })
          .range(pageTc * pageSize, (pageTc + 1) * pageSize - 1);
        if (error) throw error;
        tcPageData = data;
        if (tcPageData) allTc = allTc.concat(tcPageData);
        pageTc++;
      } while (tcPageData && tcPageData.length === pageSize);

      const tcMap = allTc.reduce((acc, current) => {
        acc[current.fecha] = current;
        return acc;
      }, {});
      setTiposCambio(tcMap);

      // 2. Cargar TODAS las Entradas Contables con paginación
      let allEntries = [];
      let pageEntries = 0;
      let entriesPageData;
      do {
        // ✅ MODIFICADO: Se añade 'es_gasto_corriente' al select anidado
        const { data, error } = await supabase
          .from('entradas_contables')
          .select(`
            id, fecha, moneda, importe_ars, importe_usd, 
            conceptos_contables (
              concepto, 
              es_gasto_corriente, 
              rubros (nombre)
            )
          `)
          .eq('usuario_id', user.id)
          .gte('fecha', fechaDesde)
          .lt('fecha', fechaHastaPlusOneDay)
          .order('fecha', { ascending: true })
          .range(pageEntries * pageSize, (pageEntries + 1) * pageSize - 1);
        if (error) throw error;
        entriesPageData = data;
        if (entriesPageData) allEntries = allEntries.concat(entriesPageData);
        pageEntries++;
      } while (entriesPageData && entriesPageData.length === pageSize);

      setData(allEntries);

    } catch (err) {
      console.error('Error fetching data:', err.message);
      setError('Error al cargar datos: ' + err.message);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (data.length === 0) {
      toast.addToast('No hay datos para exportar.', 'info');
      return;
    }
    setIsExporting(true);
    try {
      // ✅ MODIFICADO: Añadido 'Gasto Corriente' a los headers
      const headers = [
        'Fecha', 'Rubro', 'Concepto', 'Gasto Corriente', 'Moneda',
        'Importe ARS', 'Importe USD', 'Tipo de Cambio MEP',
        'Tipo de Cambio CCL', 'Tipo de Cambio Oficial'
      ];
      
      // ✅ MODIFICADO: Añadido el nuevo campo a las filas (con formato Sí/No)
      const rows = data.map(entry => {
        const tc = tiposCambio[entry.fecha] || {};
        return [
          entry.fecha,
          entry.conceptos_contables?.rubros?.nombre,
          entry.conceptos_contables?.concepto,
          entry.conceptos_contables?.es_gasto_corriente ? 'Sí' : 'No', // <-- NUEVO DATO
          entry.moneda,
          entry.importe_ars,
          entry.importe_usd,
          tc.usd_mep || 'N/A',
          tc.usd_ccl || 'N/A',
          tc.usd_oficial || 'N/A'
        ];
      });
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Entradas Contables");
      XLSX.writeFile(wb, "EntradasContables.xlsx");
    } catch (err) {
      console.error('Error exporting to Excel:', err);
      toast.addToast('Error al exportar a Excel. Intenta de nuevo.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction, secondaryKey: 'rubro', tertiaryKey: 'concepto' });
  };

  const rubroHierarchy = {
    'Activo Corriente': 3,
    'Activo No Corriente': 2,
    'Pasivo': 1,
  };

  const getSortValue = (item, key) => {
    switch (key) {
      case 'fecha': return new Date(item.fecha);
      case 'rubro': return rubroHierarchy[item.conceptos_contables?.rubros?.nombre] || 99;
      case 'concepto': return item.conceptos_contables?.concepto || '';
      // ✅ MODIFICADO: Añadido caso para ordenar por 'gasto_corriente'
      case 'gasto_corriente': return item.conceptos_contables?.es_gasto_corriente || false;
      case 'moneda': return item.moneda;
      case 'importe_ars': return item.importe_ars;
      case 'importe_usd': return item.importe_usd;
      case 'usd_mep': return tiposCambio[item.fecha]?.usd_mep || 0;
      case 'usd_ccl': return tiposCambio[item.fecha]?.usd_ccl || 0;
      case 'usd_oficial': return tiposCambio[item.fecha]?.usd_oficial || 0;
      default: return 0;
    }
  };

  const sortedData = () => {
    const sortableItems = [...data];
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        const aPrimary = getSortValue(a, sortConfig.key);
        const bPrimary = getSortValue(b, sortConfig.key);
        let comparison = 0;
        if (aPrimary < bPrimary) comparison = -1;
        else if (aPrimary > bPrimary) comparison = 1;

        if (comparison === 0) {
            const aSecondary = getSortValue(a, 'rubro');
            const bSecondary = getSortValue(b, 'rubro');
            if (aSecondary < bSecondary) comparison = -1;
            else if (aSecondary > bSecondary) comparison = 1;
        }
        
        if (comparison === 0) {
            const aTertiary = getSortValue(a, 'concepto');
            const bTertiary = getSortValue(a, 'concepto');
            if (aTertiary < bTertiary) comparison = -1;
            else if (aTertiary > bTertiary) comparison = 1;
        }
        return sortConfig.direction === 'ascending' ? comparison : -comparison;
      });
    }
    return sortableItems;
  };

  const displayData = sortedData();

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return null;
    return sortConfig.direction === 'ascending' ? ' ▲' : ' ▼';
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 font-sans">
      <header className="bg-white shadow-sm px-4 py-3 flex items-center border-b border-gray-100">
        <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
          {pageIcon && <span className="flex-shrink-0">{pageIcon}</span>}
          Exportar a Excel
        </h2>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        <main className="container mx-auto">
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Entradas Contables</h3>
            <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-4 mb-4">
              <div className="w-full sm:w-auto">
                <label htmlFor="fechaDesde" className="block text-sm font-medium text-gray-700">Fecha Desde</label>
                <input
                  type="date" id="fechaDesde" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
              <div className="w-full sm:w-auto">
                <label htmlFor="fechaHasta" className="block text-sm font-medium text-gray-700">Fecha Hasta</label>
                <input
                  type="date" id="fechaHasta" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
              <div className="w-full sm:w-auto mt-auto flex-grow flex space-x-2">
                <button
                  onClick={handleVer}
                  className="w-full sm:w-auto inline-flex items-center justify-center bg-indigo-600 text-white py-2 px-4 rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 font-medium transition-colors duration-150"
                  disabled={loading}
                >
                  {loading ? (
                    <><svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.962l2-2.671z"></path></svg>Cargando...</>
                  ) : (
                    <><EyeIcon className="h-5 w-5 mr-2" />Ver</>
                  )}
                </button>
                <button
                  onClick={handleExport}
                  className="w-full sm:w-auto inline-flex items-center justify-center bg-green-600 text-white py-2 px-4 rounded-md shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 font-medium transition-colors duration-150"
                  disabled={data.length === 0 || isExporting}
                >
                  {isExporting ? (
                    <><svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.962l2-2.671z"></path></svg>Exportando...</>
                  ) : (
                    <><DocumentArrowDownIcon className="h-5 w-5 mr-2" />Exportar a Excel</>
                  )}
                </button>
              </div>
            </div>
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                <strong className="font-bold">¡Error!</strong><span className="block sm:inline"> {error}</span>
              </div>
            )}
            {loading ? (
              <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent"></div></div>
            ) : (
              <div className="overflow-x-auto rounded-lg shadow-sm border border-gray-200" style={{ maxHeight: '70vh' }}>
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('fecha')}>Fecha {getSortIcon('fecha')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('rubro')}>Rubro {getSortIcon('rubro')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('concepto')}>Concepto {getSortIcon('concepto')}</th>
                      {/* ✅ MODIFICADO: Nueva columna en la cabecera (clicable para ordenar) */}
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('gasto_corriente')}>Gasto Corriente {getSortIcon('gasto_corriente')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('moneda')}>Moneda {getSortIcon('moneda')}</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('importe_ars')}>Importe ARS {getSortIcon('importe_ars')}</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('importe_usd')}>Importe USD {getSortIcon('importe_usd')}</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('usd_mep')}>Tipo de Cambio MEP {getSortIcon('usd_mep')}</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('usd_ccl')}>Tipo de Cambio CCL {getSortIcon('usd_ccl')}</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('usd_oficial')}>Tipo de Cambio Oficial {getSortIcon('usd_oficial')}</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {displayData.length > 0 ? (
                      displayData.map(entry => {
                        const tc = tiposCambio[entry.fecha];
                        return (
                          <tr key={entry.id}>
                            <td className="p-1 whitespace-nowrap text-sm font-medium text-gray-800">{entry.fecha}</td>
                            <td className="p-1 whitespace-nowrap text-sm text-gray-600">{entry.conceptos_contables?.rubros?.nombre}</td>
                            <td className="p-1 whitespace-nowrap text-sm text-gray-600">{entry.conceptos_contables?.concepto}</td>
                            {/* ✅ MODIFICADO: Nueva celda con el dato Sí/No */}
                            <td className="p-1 whitespace-nowrap text-sm text-gray-600">
                              {entry.conceptos_contables?.es_gasto_corriente ? 'Sí' : 'No'}
                            </td>
                            <td className="p-1 whitespace-nowrap text-sm text-gray-600">{entry.moneda}</td>
                            <td className="p-1 whitespace-nowrap text-sm text-gray-600 text-right">${parseFloat(entry.importe_ars).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="p-1 whitespace-nowrap text-sm text-gray-600 text-right">${parseFloat(entry.importe_usd).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="p-1 whitespace-nowrap text-sm text-gray-600 text-right font-medium">{tc?.usd_mep ? `$${tc.usd_mep.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : 'N/A'}</td>
                            <td className="p-1 whitespace-nowrap text-sm text-gray-600 text-right font-medium">{tc?.usd_ccl ? `$${tc.usd_ccl.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : 'N/A'}</td>
                            <td className="p-1 whitespace-nowrap text-sm text-gray-600 text-right font-medium">{tc?.usd_oficial ? `$${tc.usd_oficial.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : 'N/A'}</td>
                          </tr>
                        );
                      })
                    ) : (
                      // ✅ MODIFICADO: colSpan actualizado a 10
                      <tr><td colSpan="10" className="px-6 py-4 text-center text-gray-500">No hay entradas contables para los filtros seleccionados.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}