export default function shortUUID() {
    const uuid = +new Date();
    return `${uuid}`;
}