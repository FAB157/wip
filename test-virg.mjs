fetch('http://localhost:3000/api/virgilio?city=roma')
.then(async res => {
  console.log(res.status)
  console.log(await res.text())
})
.catch(console.error);
