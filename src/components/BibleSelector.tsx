import { Box, Navbar, ScrollArea, createStyles, rem } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { getBooks, getChapters, getVerses } from "../api";
import { useBibleStore } from "../store";

const useStyles = createStyles((theme) => ({
  border: {
    borderRight: `${rem(1)} solid ${
      theme.colorScheme === "dark" ? theme.colors.dark[5] : theme.colors.gray[3]
    }`,
  },

  link: {
    boxSizing: "border-box",
    display: "block",
    textDecoration: "none",
    color:
      theme.colorScheme === "dark"
        ? theme.colors.dark[0]
        : theme.colors.gray[7],
    padding: `0 ${theme.spacing.xs}`,
    fontSize: theme.fontSizes.sm,
    marginRight: theme.spacing.xs,
    marginLeft: theme.spacing.xs,
    fontWeight: 500,
    height: rem(30),
    lineHeight: rem(30),

    "&:hover": {
      backgroundColor:
        theme.colorScheme === "dark"
          ? theme.colors.dark[5]
          : theme.colors.gray[1],
      color: theme.colorScheme === "dark" ? theme.white : theme.black,
    },
  },

  linkActive: {
    "&, &:hover": {
      backgroundColor:
        theme.colorScheme === "dark"
          ? theme.colors.dark[5]
          : theme.colors.gray[1],
      color: theme.colorScheme === "dark" ? theme.white : theme.black,
    },
  },
}));

const BibleSelector = ({
  opened,
  setOpened,
}: {
  opened: boolean;
  setOpened: (opened: boolean) => void;
}) => {
  const { classes, cx } = useStyles();
  const navigate = useNavigate();
  const activeBook = useBibleStore((state) => state.activeBook);
  const activeChapter = useBibleStore((state) => state.activeChapter);
  const activeVerses = useBibleStore((state) => state.activeVerses);
  const setActiveBookShort = useBibleStore(
    (state) => state.setActiveBookShort
  );
  const setActiveBookWithPosition = useBibleStore(
    (state) => state.setActiveBookWithPosition
  );

  return (
    <Navbar
      hiddenBreakpoint="sm"
      hidden={!opened}
      width={{ sm: 320, lg: 320 }}
      sx={{
        overflow: "hidden",
        transition: "width 1000ms ease, min-width 1000ms ease",
      }}
    >
      <Navbar.Section grow sx={{ overflow: "hidden" }}>
        <Box
          style={{
            display: "flex",
            height: "100%",
            overflow: "hidden",
          }}
        >
          <Box style={{ flex: "0 0 185px", overflow: "hidden" }}>
            <ScrollArea h="100%" className={classes.border}>
              {getBooks().map((book) => (
                <a
                  className={cx(classes.link, {
                    [classes.linkActive]: activeBook === book.book_name,
                  })}
                  href="/"
                  onClick={async (event) => {
                    event.preventDefault();
                    setActiveBookShort(book.book_id);
                    
                    await setActiveBookWithPosition(book.book_name);
                    
                    const state = useBibleStore.getState();
                    console.log(
                      `🔗 Navigating to: /bible/${book.book_name}/${
                        state.activeChapter
                      }`
                    );
                    navigate(
                      `/bible/${book.book_name}/${state.activeChapter}`
                    );
                  }}
                  key={book.book_id}
                  title={"nav-book-" + book.book_id}
                >
                  {book.book_name}
                </a>
              ))}
            </ScrollArea>
          </Box>
          <Box style={{ flex: "1 0 60px", overflow: "hidden" }}>
            <ScrollArea h="100%" className={classes.border}>
              {getChapters(activeBook).map((chapter) => (
                <a
                  className={cx(classes.link, {
                    [classes.linkActive]: activeChapter === chapter,
                  })}
                  href="/"
                  onClick={(event) => {
                    event.preventDefault();
                    console.log(`🔗 Navigating to: /bible/${activeBook}/${chapter}`);
                    navigate(`/bible/${activeBook}/${chapter}`);
                  }}
                  key={chapter}
                  title={"nav-chapter-" + chapter}
                >
                  {chapter}
                </a>
              ))}
            </ScrollArea>
          </Box>
          <Box style={{ flex: "1 0 60px", overflow: "hidden" }}>
            <ScrollArea h="100%">
              {getVerses(activeBook, activeChapter).map((verse) => (
                <a
                  className={cx(classes.link, {
                    [classes.linkActive]: activeVerses.includes(verse),
                  })}
                  href="/"
                  onClick={(event) => {
                    event.preventDefault();
                    navigate(
                      `/bible/${activeBook}/${activeChapter}.${verse}`
                    );
                    setOpened(false);
                  }}
                  key={verse}
                  title={"nav-verse-" + verse}
                >
                  {verse}
                </a>
              ))}
            </ScrollArea>
          </Box>
        </Box>
      </Navbar.Section>
    </Navbar>
  );
};

export default BibleSelector;
