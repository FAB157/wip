const fetchData = async () => {
  try {
    const res = await fetch("https://corsproxy.io/?https://www.dati.gov.it/api/3/action/package_search?q=carrara");
    const text = await res.text();
    console.log(res.status, text.slice(0, 500));
  } catch (e) {
    console.error(e);
  }
};
fetchData();
