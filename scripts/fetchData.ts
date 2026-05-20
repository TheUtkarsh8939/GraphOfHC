import * as fs from 'fs'

interface YswsEntry {
    id: string
    ysws:string
    code_url: string
    description: string
    demo_url: string
    hours: number
    name: string
    
}
const extractNameFromCodeUrl = (codeUrl: string): string => {
    const urlParts = codeUrl.split('/')
    return urlParts[urlParts.length - 1]
}
const main = async () => {
    const response = await fetch("https://ships.hackclub.com/api/v1/ysws_entries?all=true")
    const data = await response.json()
    const filteredData: YswsEntry[] = []
    let codeURLs: string[] = [] 
    //Code URL array to find duplicate entries, since each project has a unique code URL and 
    //a project may have multiple entry for different submissions.
    //Whenever we find a duplicate Code URL we search in already proccessed data for the project code url
    //and add the hours to the existing entry instead of creating a new one.
    data.forEach((unproccessedEntry: any) => {
        const entry: YswsEntry = {
            id: unproccessedEntry.id,
            ysws: unproccessedEntry.ysws,
            code_url: unproccessedEntry.code_url,
            description: unproccessedEntry.description,
            demo_url: unproccessedEntry.demo_url,
            hours: unproccessedEntry.hours,
            name: extractNameFromCodeUrl(unproccessedEntry.code_url)
        }
        if (codeURLs.includes(entry.code_url)) {
            const existingEntry = filteredData.find(e => e.code_url === entry.code_url)
            if (existingEntry) {
                existingEntry.hours += entry.hours
            }
        } else {
            codeURLs.push(entry.code_url)
            filteredData.push(entry)
        }
    })
    //Save the filtered data to a JSON file
    const jsonData = JSON.stringify(filteredData, null, 2)
    try{
        fs.writeFileSync('ysws_entries.json', jsonData, 'utf-8')
        console.log('Data saved to ysws_entries.json, Wrote ' + filteredData.length + ' entries to the file. Out of ' + data.length + ' total entries.')
    }catch (error) {
        console.error('Error writing to file:', error)
    }
    

}
main().then(() => console.log('Data fetching and processing complete.')).catch((error) => console.error('Error in main function:', error))