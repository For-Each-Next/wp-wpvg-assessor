/**
 * Resolves associated MediaWiki subject and talk titles.
 *
 * @param title - Wiki title.
 * @returns Resolved associated MediaWiki subject and talk titles.
 */

export function getTalkPageTitle(title: mw.Title): string {
    if (title.getNamespaceId() % 2 === 1) {
        return title.getPrefixedText();
    }

    const talkTitle = new mw.Title(
        title.getMainText(),
        title.getNamespaceId() + 1,
    );
    return talkTitle.getPrefixedText();
}

export function getSubjectPageTitle(title: mw.Title): string {
    if (title.getNamespaceId() % 2 === 0) {
        return title.getPrefixedText();
    }

    const subjectTitle = new mw.Title(
        title.getMainText(),
        title.getNamespaceId() - 1,
    );
    return subjectTitle.getPrefixedText();
}
