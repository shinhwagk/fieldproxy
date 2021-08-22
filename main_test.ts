const num = 40;
for (const _ of new Array(num)) {
  const res = await fetch("http://test:8000", {
    headers: {
      "X-multidatabase-dbid": Math.ceil(Math.random() * num).toString(),
    },
  });
  console.log(res.status, await res.text());
}

// for (const _ of new Array(num)) {
//   const res = await fetch("http://127.0.0.1:8000", {
//     method: "POST",
//     headers: {
//       "X-multidatabase-dbid": Math.ceil(Math.random() * num).toString() + "_",
//     },
//   });
//   console.log(res.status, await res.text());
// }
